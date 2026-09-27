"""Placing, reading, cancelling orders and moving them through their statuses.

Lock order used everywhere (so no two transactions can wait on each other in a cycle):
    idempotency key → carts row → cart_items → inventory rows (sorted)  [checkout]
    carts row → cart_items                                              [cart edits]
    orders row → inventory rows (sorted by product_id)                  [cancel]
"""

from dataclasses import dataclass
from http import HTTPStatus
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.errors import ConflictError, NotFoundError
from app.models import Cart, CartItem, Inventory, MovementReason, Order, OrderItem, OrderStatus, Role, User
from app.schemas.order import OrderResponse, PlaceOrderRequest
from app.services import idempotency_service
from app.services.inventory_service import InsufficientStockError, apply_stock_change, lock_inventory


class CartEmptyError(ConflictError):
    code = "CART_EMPTY"


class OrderNotFoundError(NotFoundError):
    code = "ORDER_NOT_FOUND"


class InvalidStatusTransitionError(ConflictError):
    code = "INVALID_STATUS_TRANSITION"


# The whole state machine. Anything not listed here is rejected with 409.
ALLOWED_TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.PENDING: {OrderStatus.CONFIRMED, OrderStatus.CANCELLED},
    OrderStatus.CONFIRMED: {OrderStatus.SHIPPED, OrderStatus.CANCELLED},
    OrderStatus.SHIPPED: set(),  # terminal: goods have left the warehouse
    OrderStatus.CANCELLED: set(),  # terminal: stock already returned
}


def _order_query():
    # selectinload: items (and their products) in one extra query per request, not one per order.
    return select(Order).options(selectinload(Order.items).joinedload(OrderItem.product))


# --- placing an order ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CheckoutResult:
    status_code: int
    body: dict[str, Any]
    replayed: bool  # True when this is a retry answered from the stored response


def checkout(db: Session, user: User, request: PlaceOrderRequest, idempotency_key: str) -> CheckoutResult:
    """Idempotent checkout: claim the key, place the order, store the response, all in ONE transaction.

    Lock order: idempotency key (unique index) → carts row → cart_items → inventory (sorted).
    """
    request_hash = idempotency_service.fingerprint(request.model_dump(mode="json"))
    try:
        stored = idempotency_service.claim_or_replay(db, user.id, idempotency_key, request_hash)
        if stored is not None:
            db.rollback()  # nothing to write; just end the transaction
            return CheckoutResult(stored.status_code, stored.body, replayed=True)

        order = _create_order_from_cart(db, user, request.shipping_address)
        # The stored response is exactly the API response, so a retry gets byte-for-byte the same order.
        body = OrderResponse.from_order(order).model_dump(mode="json")
        idempotency_service.save_response(db, user.id, idempotency_key, HTTPStatus.CREATED, body)
        db.commit()  # key + order + stock changes + emptied cart + stored response, all at once
    except Exception:
        # Undo everything (including the key row, so the client can retry with the same key) and release locks.
        db.rollback()
        raise
    return CheckoutResult(HTTPStatus.CREATED, body, replayed=False)


def _create_order_from_cart(db: Session, user: User, shipping_address: str) -> Order:
    """Turn the user's cart into an order. Does NOT commit: the caller owns the transaction."""
    # 1. Lock the cart row. A second checkout of the same cart (another tab, a double click with a different
    #    key) waits here, then finds the cart empty, so one cart can never become two orders.
    cart = db.scalar(select(Cart).where(Cart.user_id == user.id).with_for_update())
    items = _load_cart_items(db, cart)
    if not items:
        raise CartEmptyError("Your cart is empty")

    # 2. Lock the inventory rows, sorted by product_id (deadlock-free), and re-check stock *after*
    #    getting the locks. Nobody else can change these quantities until we commit.
    stock = lock_inventory(db, [item.product_id for item in items])
    _ensure_all_available(items, stock)

    # 3. Create the order, freezing today's prices into the order items.
    order = Order(
        user_id=user.id,
        status=OrderStatus.PENDING,
        shipping_address=shipping_address,
        total_paise=sum(item.product.price_paise * item.quantity for item in items),
    )
    db.add(order)
    db.flush()  # assigns order.id for the items and movements
    for item in items:
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=item.product_id,
                quantity=item.quantity,
                unit_price_paise=item.product.price_paise,
            )
        )
        # 4. Decrement stock and write the ledger row (never below zero; DB CHECK as a backstop).
        apply_stock_change(
            db, stock[item.product_id], -item.quantity, MovementReason.ORDER,
            actor_user_id=user.id, order_id=order.id,
        )

    # 5. Empty the cart. Re-read the order (still inside the transaction) with its items for the response.
    db.execute(delete(CartItem).where(CartItem.cart_id == cart.id))
    db.flush()
    return get_order(db, user, order.id)


def _load_cart_items(db: Session, cart: Cart | None) -> list[CartItem]:
    if cart is None:
        return []
    return list(
        db.scalars(
            select(CartItem)
            .where(CartItem.cart_id == cart.id)
            .options(joinedload(CartItem.product))
            .order_by(CartItem.product_id)
            # Read the cart as it is *now* that we hold the lock, not as this session last saw it.
            .execution_options(populate_existing=True)
        )
    )


def _ensure_all_available(items: list[CartItem], stock: dict[int, Inventory]) -> None:
    """Report every problem at once, so the user can fix the whole cart in one go."""
    problems = []
    for item in items:
        available = stock[item.product_id].quantity
        if not item.product.is_active:
            problems.append(_problem(item, available, "product_unavailable"))
        elif available < item.quantity:
            problems.append(_problem(item, available, "insufficient_stock"))
    if problems:
        raise InsufficientStockError("Some items in your cart can't be ordered", details=problems)


def _problem(item: CartItem, available: int, reason: str) -> dict:
    return {"product_id": item.product_id, "requested": item.quantity, "available": available, "reason": reason}


# --- reading ------------------------------------------------------------------------------------


def get_order(db: Session, actor: User, order_id: int, *, lock: bool = False) -> Order:
    """Owners see their own orders, admins see all. Someone else's order is a 404, not a 403,
    so order ids can't be probed to learn which ones exist."""
    query = _order_query().where(Order.id == order_id).execution_options(populate_existing=True)
    if lock:
        query = query.with_for_update()
    order = db.scalar(query)
    if order is None or (actor.role != Role.ADMIN and order.user_id != actor.id):
        raise OrderNotFoundError(f"Order {order_id} not found")
    return order


def list_orders(db: Session, *, user_id: int | None, limit: int, offset: int) -> tuple[list[Order], int]:
    """user_id=None lists everyone's orders (admin view)."""
    count_query = select(func.count(Order.id))
    query = _order_query()
    if user_id is not None:
        count_query = count_query.where(Order.user_id == user_id)
        query = query.where(Order.user_id == user_id)
    total = db.scalar(count_query)
    # Newest first; `ix_orders_user_id_created_at` serves the per-user version of this query.
    orders = db.scalars(query.order_by(Order.id.desc()).limit(limit).offset(offset))
    return list(orders), total or 0


# --- status changes -----------------------------------------------------------------------------


def _check_transition(order: Order, new_status: OrderStatus) -> None:
    if new_status not in ALLOWED_TRANSITIONS[order.status]:
        raise InvalidStatusTransitionError(
            f"Cannot change order {order.id} from {order.status} to {new_status}",
            details={"from": order.status, "to": new_status},
        )


def cancel_order(db: Session, actor: User, order_id: int) -> Order:
    """Cancel and put the stock back, in one transaction."""
    try:
        # Lock the order first: two concurrent cancels queue here, and the second one sees "cancelled"
        # and gets a 409, so stock is returned exactly once.
        order = get_order(db, actor, order_id, lock=True)
        _check_transition(order, OrderStatus.CANCELLED)

        stock = lock_inventory(db, [item.product_id for item in order.items])
        for item in order.items:
            apply_stock_change(
                db, stock[item.product_id], item.quantity, MovementReason.CANCEL,
                actor_user_id=actor.id, order_id=order.id,
            )
        order.status = OrderStatus.CANCELLED
        db.commit()
    except Exception:
        db.rollback()
        raise
    return get_order(db, actor, order_id)


def update_status(db: Session, admin: User, order_id: int, new_status: OrderStatus) -> Order:
    if new_status == OrderStatus.CANCELLED:
        return cancel_order(db, admin, order_id)  # cancelling must also return stock
    try:
        order = get_order(db, admin, order_id, lock=True)
        _check_transition(order, new_status)
        order.status = new_status
        db.commit()
    except Exception:
        db.rollback()
        raise
    return get_order(db, admin, order_id)
