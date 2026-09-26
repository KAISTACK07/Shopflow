from datetime import datetime
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.constants import MAX_STOCK_QUANTITY, MOVEMENT_NOTE_MAX_LENGTH
from app.models import MovementReason, Product


class StockAdjustment(BaseModel):
    """Admin stock change. Relative (`delta`), never absolute: "set stock to 50" would silently overwrite
    any units sold between the admin reading the number and submitting the form."""

    model_config = ConfigDict(extra="forbid")

    delta: int | None = Field(default=None, ge=-MAX_STOCK_QUANTITY, le=MAX_STOCK_QUANTITY)
    # "order" and "cancel" movements are written only by the order flow, never by hand.
    reason: Literal["restock", "adjustment"] | None = None
    note: str | None = Field(default=None, max_length=MOVEMENT_NOTE_MAX_LENGTH)
    low_stock_threshold: int | None = Field(default=None, ge=0, le=MAX_STOCK_QUANTITY)

    @model_validator(mode="after")
    def _check_combination(self) -> Self:
        if self.delta is None and self.low_stock_threshold is None:
            raise ValueError("send a delta, a low_stock_threshold, or both")
        if self.delta is None:
            if self.reason is not None or self.note is not None:
                raise ValueError("reason and note only apply to a stock delta")
            return self
        if self.delta == 0:
            raise ValueError("delta cannot be 0")
        if self.reason is None:
            raise ValueError("a stock delta needs a reason: restock or adjustment")
        if self.reason == "restock" and self.delta < 0:
            raise ValueError("a restock must add stock; use reason=adjustment to remove units")
        return self


class InventoryItem(BaseModel):
    product_id: int
    sku: str
    name: str
    is_active: bool
    quantity: int
    low_stock_threshold: int
    is_low_stock: bool
    updated_at: datetime

    @classmethod
    def from_product(cls, product: Product) -> "InventoryItem":
        inventory = product.inventory
        return cls(
            product_id=product.id,
            sku=product.sku,
            name=product.name,
            is_active=product.is_active,
            quantity=inventory.quantity,
            low_stock_threshold=inventory.low_stock_threshold,
            is_low_stock=inventory.quantity <= inventory.low_stock_threshold,
            updated_at=inventory.updated_at,
        )


class MovementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    delta: int
    reason: MovementReason
    order_id: int | None
    actor_user_id: int | None
    note: str | None
    created_at: datetime
