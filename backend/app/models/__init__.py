"""Importing this package registers every table on Base.metadata (Alembic relies on that)."""

from app.models.base import Base
from app.models.cart import Cart, CartItem
from app.models.idempotency import IdempotencyKey
from app.models.inventory import Inventory, InventoryMovement, MovementReason
from app.models.order import Order, OrderItem, OrderStatus
from app.models.product import Product
from app.models.user import Role, User

__all__ = [
    "Base",
    "Cart",
    "CartItem",
    "IdempotencyKey",
    "Inventory",
    "InventoryMovement",
    "MovementReason",
    "Order",
    "OrderItem",
    "OrderStatus",
    "Product",
    "Role",
    "User",
]
