"""Catalogue rules: create, read, search, update, soft-delete products."""

from typing import Any

from sqlalchemy import Select, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.errors import ConflictError, NotFoundError
from app.db import violated_constraint
from app.models import Inventory, InventoryMovement, MovementReason, Product, User
from app.schemas.product import ProductCreate


class ProductNotFoundError(NotFoundError):
    code = "PRODUCT_NOT_FOUND"


class SkuAlreadyExistsError(ConflictError):
    code = "SKU_ALREADY_EXISTS"


def create_product(db: Session, data: ProductCreate, actor: User | None) -> Product:
    """Product, its inventory row and (if stocked) the first ledger entry, all in one transaction.
    `actor` is the admin doing it, or None for system-created data (the seed script)."""
    inventory = Inventory(quantity=data.initial_stock)
    if data.low_stock_threshold is not None:
        inventory.low_stock_threshold = data.low_stock_threshold

    product = Product(
        sku=data.sku,
        name=data.name,
        description=data.description,
        price_paise=data.price_paise,
        inventory=inventory,
    )
    db.add(product)
    try:
        db.flush()  # assigns product.id, needed for the movement row
        if data.initial_stock > 0:
            # Keeps the ledger invariant: SUM(movements.delta) == inventory.quantity for every product.
            db.add(
                InventoryMovement(
                    product_id=product.id,
                    delta=data.initial_stock,
                    reason=MovementReason.RESTOCK,
                    actor_user_id=actor.id if actor else None,
                    note="initial stock",
                )
            )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if violated_constraint(exc) == "uq_products_sku":
            raise SkuAlreadyExistsError(f"SKU {data.sku} already exists") from exc
        raise
    return product


def get_product(db: Session, product_id: int, *, include_inactive: bool = False) -> Product:
    product = db.scalar(select(Product).options(joinedload(Product.inventory)).where(Product.id == product_id))
    # A deactivated product is "deleted" for customers: 404, same as one that never existed.
    if product is None or (not product.is_active and not include_inactive):
        raise ProductNotFoundError(f"Product {product_id} not found")
    return product


def _escape_like(term: str) -> str:
    """Make % and _ in user input match literally instead of acting as wildcards."""
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _filtered(query: Select, search: str | None, include_inactive: bool) -> Select:
    if not include_inactive:
        query = query.where(Product.is_active.is_(True))
    if search:
        pattern = f"%{_escape_like(search)}%"
        query = query.where(or_(Product.name.ilike(pattern, escape="\\"), Product.sku.ilike(pattern, escape="\\")))
    return query


def list_products(
    db: Session, *, search: str | None, limit: int, offset: int, include_inactive: bool
) -> tuple[list[Product], int]:
    total = db.scalar(_filtered(select(func.count(Product.id)), search, include_inactive))
    rows = db.scalars(
        _filtered(select(Product), search, include_inactive)
        # joinedload: fetch stock in the same query instead of one extra query per product (N+1).
        .options(joinedload(Product.inventory))
        # Newest first; id is unique, so the order is stable and pages never overlap or skip rows.
        .order_by(Product.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(rows), total or 0


def update_product(db: Session, product_id: int, changes: dict[str, Any]) -> Product:
    product = get_product(db, product_id, include_inactive=True)
    for field, value in changes.items():
        setattr(product, field, value)
    db.commit()
    return product


def deactivate_product(db: Session, product_id: int) -> None:
    """Soft delete. Idempotent: deactivating an inactive product is a no-op.
    Order history keeps pointing at the row, which is why we never hard-delete."""
    product = get_product(db, product_id, include_inactive=True)
    product.is_active = False
    db.commit()
