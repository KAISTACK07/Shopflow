from datetime import datetime
from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, StringConstraints, model_validator

from app.constants import (
    MAX_PRICE_PAISE,
    MAX_STOCK_QUANTITY,
    PRODUCT_DESCRIPTION_MAX_LENGTH,
    PRODUCT_NAME_MAX_LENGTH,
    SKU_MAX_LENGTH,
    SKU_MIN_LENGTH,
    SKU_PATTERN,
)
from app.models import Product

def _normalise_sku(value: Any) -> Any:
    return value.strip().upper() if isinstance(value, str) else value


# " tshirt-blk-m " is accepted and stored as "TSHIRT-BLK-M". Normalising happens in a BeforeValidator because
# StringConstraints checks `pattern` *before* applying its own `to_upper`, which would reject lower case.
Sku = Annotated[
    str,
    BeforeValidator(_normalise_sku),
    StringConstraints(min_length=SKU_MIN_LENGTH, max_length=SKU_MAX_LENGTH, pattern=SKU_PATTERN),
]
ProductName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=PRODUCT_NAME_MAX_LENGTH)]
Description = Annotated[str, Field(max_length=PRODUCT_DESCRIPTION_MAX_LENGTH)]
# Integer paise: 499.5 is rejected (422), never rounded.
PricePaise = Annotated[int, Field(gt=0, le=MAX_PRICE_PAISE, description="Price in paise (₹1 = 100)")]
StockQuantity = Annotated[int, Field(ge=0, le=MAX_STOCK_QUANTITY)]


class ProductCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sku: Sku
    name: ProductName
    description: Description = ""
    price_paise: PricePaise
    initial_stock: StockQuantity = 0
    low_stock_threshold: StockQuantity | None = Field(default=None, description="Defaults to the shop-wide value")


class ProductUpdate(BaseModel):
    """Partial update. SKU is immutable (other systems use it as the product's identity); stock changes go
    through the inventory endpoint so they are always recorded as movements."""

    model_config = ConfigDict(extra="forbid")

    name: ProductName | None = None
    description: Description | None = None
    price_paise: PricePaise | None = None
    is_active: bool | None = None

    @model_validator(mode="before")
    @classmethod
    def _reject_explicit_nulls(cls, data: Any) -> Any:
        # Omitting a field means "leave it"; sending null would mean "erase it", which no field allows.
        if isinstance(data, dict):
            null_fields = sorted(key for key, value in data.items() if value is None)
            if null_fields:
                raise ValueError(f"fields cannot be null: {', '.join(null_fields)}")
        return data


class ProductResponse(BaseModel):
    id: int
    sku: str
    name: str
    description: str
    price_paise: int
    is_active: bool
    stock_quantity: int
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, product: Product) -> "ProductResponse":
        return cls(
            id=product.id,
            sku=product.sku,
            name=product.name,
            description=product.description,
            price_paise=product.price_paise,
            is_active=product.is_active,
            stock_quantity=product.inventory.quantity,
            created_at=product.created_at,
            updated_at=product.updated_at,
        )
