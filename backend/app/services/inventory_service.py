"""Stock levels and the movement ledger. Every stock change in the app goes through `apply_stock_change`."""

from collections.abc import Iterable

from sqlalchemy import func, select
from sqlalchemy.orm import Session, contains_eager

from app.core.errors import ConflictError
from app.models import Inventory, InventoryMovement, MovementReason, Product, User
from app.schemas.inventory import StockAdjustment
from app.services.product_service import get_product


class InsufficientStockError(ConflictError):
    code = "INSUFFICIENT_STOCK"


def lock_inventory(db: Session, product_ids: Iterable[int]) -> dict[int, Inventory]:
    """Lock inventory rows with SELECT ... FOR UPDATE until the transaction ends.

    - Sorted by product_id: every transaction takes locks in the same order, so two transactions can
      never each hold a row the other is waiting for (no deadlock cycle).
    - populate_existing: if this session already loaded one of these rows (e.g. via joinedload), SQLAlchemy
      would otherwise keep the old in-memory values instead of the ones read *after* acquiring the lock,
      and we'd compute the new quantity from stale data.
    """
    rows = db.scalars(
        select(Inventory)
        .where(Inventory.product_id.in_(sorted(set(product_ids))))
        .order_by(Inventory.product_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return {row.product_id: row for row in rows}


def apply_stock_change(
    db: Session,
    inventory: Inventory,
    delta: int,
    reason: MovementReason,
    *,
    actor_user_id: int | None = None,
    order_id: int | None = None,
    note: str | None = None,
) -> None:
    """Change stock and record why. Caller must hold the row lock (see `lock_inventory`) and commit."""
    new_quantity = inventory.quantity + delta
    if new_quantity < 0:
        raise InsufficientStockError(
            f"Only {inventory.quantity} units of product {inventory.product_id} in stock",
            details=[{"product_id": inventory.product_id, "requested": -delta, "available": inventory.quantity}],
        )
    inventory.quantity = new_quantity
    db.add(
        InventoryMovement(
            product_id=inventory.product_id,
            delta=delta,
            reason=reason,
            actor_user_id=actor_user_id,
            order_id=order_id,
            note=note,
        )
    )


def adjust_stock(db: Session, product_id: int, adjustment: StockAdjustment, actor: User) -> Product:
    product = get_product(db, product_id, include_inactive=True)  # 404 if it doesn't exist
    inventory = lock_inventory(db, [product_id])[product_id]
    try:
        if adjustment.delta is not None:
            apply_stock_change(
                db,
                inventory,
                adjustment.delta,
                MovementReason(adjustment.reason),
                actor_user_id=actor.id,
                note=adjustment.note,
            )
        if adjustment.low_stock_threshold is not None:
            inventory.low_stock_threshold = adjustment.low_stock_threshold
        db.commit()
    except Exception:
        db.rollback()  # releases the row lock straight away
        raise
    return product


def list_inventory(db: Session, *, low_stock_only: bool, limit: int, offset: int) -> tuple[list[Product], int]:
    query = select(Product).join(Product.inventory)
    if low_stock_only:
        query = query.where(Inventory.quantity <= Inventory.low_stock_threshold)

    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(
        # contains_eager: reuse the JOIN above to fill product.inventory (no N+1, no second join).
        query.options(contains_eager(Product.inventory))
        .order_by(Product.id)
        .limit(limit)
        .offset(offset)
    )
    return list(rows), total or 0


def list_movements(db: Session, product_id: int, *, limit: int, offset: int) -> tuple[list[InventoryMovement], int]:
    get_product(db, product_id, include_inactive=True)  # 404 for unknown products
    condition = InventoryMovement.product_id == product_id
    total = db.scalar(select(func.count(InventoryMovement.id)).where(condition))
    rows = db.scalars(
        select(InventoryMovement)
        .where(condition)
        .order_by(InventoryMovement.id.desc())  # newest first
        .limit(limit)
        .offset(offset)
    )
    return list(rows), total or 0
