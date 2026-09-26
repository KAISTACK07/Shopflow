from sqlalchemy import BigInteger, Boolean, CheckConstraint, Identity, String, Text, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.constants import PRODUCT_NAME_MAX_LENGTH, SKU_MAX_LENGTH, SKU_MIN_LENGTH, SKU_PATTERN
from app.models.base import Base, TimestampMixin
from app.models.inventory import Inventory


class Product(TimestampMixin, Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("price_paise > 0", name="price_positive"),
        CheckConstraint(f"sku ~ '{SKU_PATTERN}' AND length(sku) >= {SKU_MIN_LENGTH}", name="sku_format"),
        CheckConstraint("length(trim(name)) > 0", name="name_not_blank"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    sku: Mapped[str] = mapped_column(String(SKU_MAX_LENGTH), unique=True)
    name: Mapped[str] = mapped_column(String(PRODUCT_NAME_MAX_LENGTH))
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    # Integer paise (1 rupee = 100 paise): exact arithmetic, no float rounding errors.
    price_paise: Mapped[int] = mapped_column(BigInteger)
    # Soft delete: deactivated products disappear from the catalogue but old orders still reference them.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())

    inventory: Mapped[Inventory] = relationship()
