"""Demo data: an admin account and a small catalogue, so a fresh install has something to show.

Run with `python -m app.seed` (the Docker entrypoint does this when SEED_DEMO_DATA=true). Safe to run any
number of times, even from two containers at once: existing rows are left alone, never duplicated or overwritten.
"""

import logging
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import EXAMPLE_SECRET_PREFIX, get_settings
from app.core.logging import configure_logging
from app.db import SessionLocal
from app.models import Product, Role, User
from app.schemas.product import ProductCreate
from app.services.auth_service import EmailAlreadyRegisteredError, register_user
from app.services.product_service import SkuAlreadyExistsError, create_product

logger = logging.getLogger("shopflow.seed")

# Longer than the 8-character minimum for customers: this account can change prices and stock.
ADMIN_PASSWORD_MIN_LENGTH = 12

# (sku, name, price in paise, starting stock, description). Stock levels are chosen to show every state:
# plenty, low (turmeric), a single unit, and sold out.
DEMO_PRODUCTS: list[tuple[str, str, int, int, str]] = [
    ("TEE-INDIGO", "Heavyweight tee, indigo", 79_900, 42, "240 gsm cotton, hand-dyed in small batches. Boxy fit."),
    ("TEE-MADDER", "Heavyweight tee, madder red", 79_900, 18, "The same tee, dyed with madder root."),
    ("SHIRT-KHADI", "Khadi overshirt", 249_900, 12, "Handspun khadi, two chest pockets, horn buttons."),
    ("SOCKS-TURMERIC", "Turmeric socks, pair", 29_900, 60, "Cotton-rich socks dyed with turmeric."),
    ("CAP-INDIGO", "Indigo cap", 59_900, 7, "Six-panel cap in indigo twill."),
    ("SCARF-BLOCK", "Block-print scarf", 124_900, 3, "Hand block-printed in Bagru with natural dyes."),
    ("JACKET-KANTHA", "Quilted kantha jacket", 499_900, 1, "Reversible, stitched from layered vintage cotton."),
    ("TOTE-CANVAS", "Canvas tote", 49_900, 0, "Heavy canvas with a turmeric-dyed strap."),
]


@dataclass
class SeedReport:
    admin: str = "skipped"
    created_products: list[str] = field(default_factory=list)
    existing_products: list[str] = field(default_factory=list)


def seed(db: Session, *, admin_email: str, admin_password: str | None) -> SeedReport:
    report = SeedReport()
    admin, report.admin = _ensure_admin(db, admin_email, admin_password)
    for sku, name, price_paise, stock, description in DEMO_PRODUCTS:
        if db.scalar(select(Product.id).where(Product.sku == sku)) is not None:
            report.existing_products.append(sku)
            continue
        data = ProductCreate(sku=sku, name=name, price_paise=price_paise, initial_stock=stock, description=description)
        try:
            create_product(db, data, actor=admin)
            report.created_products.append(sku)
        except SkuAlreadyExistsError:  # another instance seeded it a moment ago
            report.existing_products.append(sku)
    return report


def _ensure_admin(db: Session, email: str, password: str | None) -> tuple[User | None, str]:
    email = email.strip().lower()
    existing = db.scalar(select(User).where(User.email == email))
    if existing is not None:
        if existing.role != Role.ADMIN:
            # Never promote an existing account: whoever registered this email first (and knows its password)
            # would silently become an admin.
            logger.warning("seed: %s exists as a customer; not promoting it to admin", email)
            return None, "refused: email belongs to a customer"
        return existing, "exists"  # password left unchanged

    if not password or password.startswith(EXAMPLE_SECRET_PREFIX) or len(password) < ADMIN_PASSWORD_MIN_LENGTH:
        logger.warning(
            "seed: no admin created; set SEED_ADMIN_PASSWORD to a real password of at least %d characters",
            ADMIN_PASSWORD_MIN_LENGTH,
        )
        return None, "skipped: no usable SEED_ADMIN_PASSWORD"
    try:
        return register_user(db, email, password, role=Role.ADMIN), "created"
    except EmailAlreadyRegisteredError:  # created by another instance a moment ago
        return db.scalar(select(User).where(User.email == email)), "exists"


def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    password = settings.seed_admin_password.get_secret_value() if settings.seed_admin_password else None
    with SessionLocal() as db:
        report = seed(db, admin_email=settings.seed_admin_email, admin_password=password)
    logger.info(
        "seed finished",
        extra={
            "admin_email": settings.seed_admin_email,  # never the password
            "admin": report.admin,
            "created_products": report.created_products,
            "existing_products": len(report.existing_products),
        },
    )


if __name__ == "__main__":
    main()
