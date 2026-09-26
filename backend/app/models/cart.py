from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Identity, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants import MAX_CART_ITEM_QUANTITY
from app.models.base import Base, TimestampMixin
from app.models.product import Product


class Cart(TimestampMixin, Base):
    __tablename__ = "carts"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    # UNIQUE: exactly one cart per user. Checkout empties it rather than creating a new one.
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)

    items: Mapped[list["CartItem"]] = relationship(
        back_populates="cart", cascade="all, delete-orphan", order_by="CartItem.product_id"
    )


class CartItem(Base):
    __tablename__ = "cart_items"
    __table_args__ = (
        CheckConstraint(f"quantity BETWEEN 1 AND {MAX_CART_ITEM_QUANTITY}", name="quantity_range"),
    )

    # Composite primary key: a product appears at most once per cart; adding it again changes the quantity.
    cart_id: Mapped[int] = mapped_column(ForeignKey("carts.id"), primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), primary_key=True)
    quantity: Mapped[int] = mapped_column(Integer)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    cart: Mapped[Cart] = relationship(back_populates="items")
    product: Mapped[Product] = relationship()
