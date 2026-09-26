from datetime import datetime
from enum import StrEnum

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Identity, Index, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.constants import DEFAULT_LOW_STOCK_THRESHOLD
from app.models.base import Base, str_enum


class Inventory(Base):
    """Stock for one product. Kept apart from `products` so checkout locks only these rows."""

    __tablename__ = "inventory"
    __table_args__ = (
        # Last line of defence against overselling: even buggy code can't push stock below zero.
        CheckConstraint("quantity >= 0", name="quantity_non_negative"),
        CheckConstraint("low_stock_threshold >= 0", name="threshold_non_negative"),
    )

    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), primary_key=True)
    quantity: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    low_stock_threshold: Mapped[int] = mapped_column(
        Integer, default=DEFAULT_LOW_STOCK_THRESHOLD, server_default=str(DEFAULT_LOW_STOCK_THRESHOLD)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class MovementReason(StrEnum):
    RESTOCK = "restock"
    ORDER = "order"
    CANCEL = "cancel"
    ADJUSTMENT = "adjustment"


class InventoryMovement(Base):
    """Append-only ledger: for every product, SUM(delta) equals the current inventory quantity."""

    __tablename__ = "inventory_movements"
    __table_args__ = (
        CheckConstraint("delta <> 0", name="delta_non_zero"),
        Index("ix_inventory_movements_product_id_created_at", "product_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    delta: Mapped[int] = mapped_column(Integer)
    reason: Mapped[MovementReason] = mapped_column(str_enum(MovementReason, "movement_reason"))
    # Set for order/cancel movements, so every stock change can be traced to its cause.
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id"))
    # Who made the change (the admin for restock/adjustment, the customer for order/cancel).
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
