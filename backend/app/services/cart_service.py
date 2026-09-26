"""Cart rules. The cart never reserves stock: availability is checked loosely here and for real (with row
locks) at checkout. Otherwise anyone could hold stock hostage by leaving it in a cart."""

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.constants import MAX_CART_ITEM_QUANTITY
from app.core.errors import ConflictError, NotFoundError
from app.db import violated_constraint
from app.models import Cart, CartItem, Product, User
from app.services.inventory_service import InsufficientStockError
from app.services.product_service import get_product


class CartItemNotFoundError(NotFoundError):
    code = "CART_ITEM_NOT_FOUND"


class CartLimitExceededError(ConflictError):
    code = "CART_LIMIT_EXCEEDED"


class ProductUnavailableError(ConflictError):
    code = "PRODUCT_UNAVAILABLE"


def get_cart(db: Session, user: User) -> Cart | None:
    """The user's cart with products and stock loaded, or None if they never added anything."""
    return db.scalar(
        select(Cart)
        .where(Cart.user_id == user.id)
        .options(selectinload(Cart.items).joinedload(CartItem.product).joinedload(Product.inventory))
        # Items changed by the statements below must be re-read, not taken from the session's cache.
        .execution_options(populate_existing=True)
    )


def _get_or_create_cart_id(db: Session, user_id: int) -> int:
    # INSERT ... ON CONFLICT DO NOTHING: two concurrent first "add to cart" requests can't both create a cart
    # (and one of them fail with a unique violation). Whoever loses just reads the existing row.
    db.execute(pg_insert(Cart).values(user_id=user_id).on_conflict_do_nothing(index_elements=[Cart.user_id]))
    return db.scalar(select(Cart.id).where(Cart.user_id == user_id))


def _touch(db: Session, cart_id: int) -> None:
    """Record cart activity (useful later for abandoned-cart cleanup)."""
    db.execute(Cart.__table__.update().where(Cart.id == cart_id).values(updated_at=func.now()))


def _ensure_available(product: Product, quantity: int) -> None:
    if not product.is_active:
        raise ProductUnavailableError(f"Product {product.id} is no longer available")
    available = product.inventory.quantity
    if quantity > available:
        raise InsufficientStockError(
            f"Only {available} units of product {product.id} in stock",
            details=[{"product_id": product.id, "requested": quantity, "available": available}],
        )


def add_item(db: Session, user: User, product_id: int, quantity: int) -> Cart:
    """Add a product, or increase its quantity if it's already in the cart."""
    product = get_product(db, product_id)  # 404 if missing or inactive
    cart_id = _get_or_create_cart_id(db, user.id)

    insert = pg_insert(CartItem).values(cart_id=cart_id, product_id=product_id, quantity=quantity)
    # Atomic "insert or add": the increment happens inside PostgreSQL, so two quick clicks can't both
    # read quantity 1 and both write 2 (a lost update), and can't both try to insert the same row.
    upsert = insert.on_conflict_do_update(
        index_elements=[CartItem.cart_id, CartItem.product_id],
        set_={"quantity": CartItem.quantity + insert.excluded.quantity},
    ).returning(CartItem.quantity)
    try:
        new_quantity = db.scalar(upsert)
        _ensure_available(product, new_quantity)
        _touch(db, cart_id)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if violated_constraint(exc) == "ck_cart_items_quantity_range":
            raise CartLimitExceededError(
                f"At most {MAX_CART_ITEM_QUANTITY} units of one product per cart",
                details={"product_id": product_id, "max_quantity": MAX_CART_ITEM_QUANTITY},
            ) from exc
        raise
    except Exception:
        db.rollback()
        raise
    return get_cart(db, user)


def _get_item(db: Session, user: User, product_id: int) -> CartItem:
    item = db.scalar(
        select(CartItem)
        .join(Cart)
        .where(Cart.user_id == user.id, CartItem.product_id == product_id)
        .options(joinedload(CartItem.product).joinedload(Product.inventory))
    )
    if item is None:
        raise CartItemNotFoundError(f"Product {product_id} is not in your cart")
    return item


def set_item_quantity(db: Session, user: User, product_id: int, quantity: int) -> Cart:
    item = _get_item(db, user, product_id)
    _ensure_available(item.product, quantity)
    item.quantity = quantity
    _touch(db, item.cart_id)
    db.commit()
    return get_cart(db, user)


def remove_item(db: Session, user: User, product_id: int) -> Cart | None:
    item = _get_item(db, user, product_id)
    db.execute(delete(CartItem).where(CartItem.cart_id == item.cart_id, CartItem.product_id == product_id))
    _touch(db, item.cart_id)
    db.commit()
    return get_cart(db, user)
