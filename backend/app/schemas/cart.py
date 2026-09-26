from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from app.constants import MAX_CART_ITEM_QUANTITY
from app.models import Cart, CartItem

ItemQuantity = Annotated[int, Field(ge=1, le=MAX_CART_ITEM_QUANTITY)]


class AddCartItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: int = Field(gt=0)
    quantity: ItemQuantity = 1


class UpdateCartItem(BaseModel):
    """Sets the quantity (not a delta). To remove an item use DELETE, so quantity 0 is rejected."""

    model_config = ConfigDict(extra="forbid")

    quantity: ItemQuantity


class CartItemResponse(BaseModel):
    product_id: int
    sku: str
    name: str
    unit_price_paise: int
    quantity: int
    line_total_paise: int
    available_quantity: int
    # False if the product was deactivated or stock dropped below the cart quantity since it was added.
    is_available: bool

    @classmethod
    def from_item(cls, item: CartItem) -> "CartItemResponse":
        product = item.product
        stock = product.inventory.quantity
        return cls(
            product_id=product.id,
            sku=product.sku,
            name=product.name,
            unit_price_paise=product.price_paise,
            quantity=item.quantity,
            line_total_paise=product.price_paise * item.quantity,
            available_quantity=stock,
            is_available=product.is_active and stock >= item.quantity,
        )


class CartResponse(BaseModel):
    """Totals are always computed here, from current prices. The client never sends prices."""

    items: list[CartItemResponse]
    total_quantity: int
    subtotal_paise: int
    has_unavailable_items: bool

    @classmethod
    def from_cart(cls, cart: Cart | None) -> "CartResponse":
        items = [CartItemResponse.from_item(item) for item in cart.items] if cart else []
        return cls(
            items=items,
            total_quantity=sum(item.quantity for item in items),
            subtotal_paise=sum(item.line_total_paise for item in items),
            has_unavailable_items=any(not item.is_available for item in items),
        )
