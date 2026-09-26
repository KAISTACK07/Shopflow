"""Admin inventory endpoints: stock overview, adjustments, movement history."""

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import AdminUser, DbSession
from app.constants import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.schemas.common import Page, error_responses
from app.schemas.inventory import InventoryItem, MovementResponse, StockAdjustment
from app.services import inventory_service

router = APIRouter(prefix="/inventory", tags=["inventory"])

Limit = Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)]
Offset = Annotated[int, Query(ge=0)]


@router.get("", response_model=Page[InventoryItem], responses=error_responses(401, 403, 422))
def list_inventory(
    db: DbSession,
    admin: AdminUser,
    low_stock: Annotated[bool, Query(description="Only products at or below their low-stock threshold")] = False,
    limit: Limit = DEFAULT_PAGE_SIZE,
    offset: Offset = 0,
) -> Page[InventoryItem]:
    products, total = inventory_service.list_inventory(db, low_stock_only=low_stock, limit=limit, offset=offset)
    return Page(items=[InventoryItem.from_product(p) for p in products], total=total, limit=limit, offset=offset)


@router.patch(
    "/{product_id}", response_model=InventoryItem, responses=error_responses(401, 403, 404, 409, 422)
)
def adjust_stock(product_id: int, body: StockAdjustment, db: DbSession, admin: AdminUser) -> InventoryItem:
    """Add or remove stock (always recorded as a movement) and/or change the low-stock threshold.
    Removing more units than are in stock → 409 INSUFFICIENT_STOCK."""
    product = inventory_service.adjust_stock(db, product_id, body, actor=admin)
    return InventoryItem.from_product(product)


@router.get(
    "/{product_id}/movements", response_model=Page[MovementResponse], responses=error_responses(401, 403, 404)
)
def list_movements(
    product_id: int, db: DbSession, admin: AdminUser, limit: Limit = DEFAULT_PAGE_SIZE, offset: Offset = 0
) -> Page[MovementResponse]:
    movements, total = inventory_service.list_movements(db, product_id, limit=limit, offset=offset)
    return Page(
        items=[MovementResponse.model_validate(m) for m in movements], total=total, limit=limit, offset=offset
    )
