from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.constants import SHIPPING_ADDRESS_MAX_LENGTH
from app.models import Order, OrderItem, OrderStatus

ShippingAddress = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=SHIPPING_ADDRESS_MAX_LENGTH)
]


class PlaceOrderRequest(BaseModel):
    """The items come from the server-side cart; the client only says where to ship."""

    model_config = ConfigDict(extra="forbid")

    shipping_address: ShippingAddress


class UpdateOrderStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: OrderStatus


class OrderItemResponse(BaseModel):
    product_id: int
    sku: str
    name: str
    quantity: int
    unit_price_paise: int  # price at the moment of purchase, not today's price
    line_total_paise: int

    @classmethod
    def from_item(cls, item: OrderItem) -> "OrderItemResponse":
        return cls(
            product_id=item.product_id,
            sku=item.product.sku,
            name=item.product.name,
            quantity=item.quantity,
            unit_price_paise=item.unit_price_paise,
            line_total_paise=item.unit_price_paise * item.quantity,
        )


class OrderResponse(BaseModel):
    id: int
    user_id: int
    status: OrderStatus
    total_paise: int
    shipping_address: str
    items: list[OrderItemResponse]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_order(cls, order: Order) -> "OrderResponse":
        return cls(
            id=order.id,
            user_id=order.user_id,
            status=order.status,
            total_paise=order.total_paise,
            shipping_address=order.shipping_address,
            items=[OrderItemResponse.from_item(item) for item in order.items],
            created_at=order.created_at,
            updated_at=order.updated_at,
        )
