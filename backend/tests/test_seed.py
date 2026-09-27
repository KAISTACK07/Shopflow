import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import verify_password
from app.models import Inventory, InventoryMovement, Product, Role, User
from app.seed import DEMO_PRODUCTS, seed
from app.services.auth_service import register_user

ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "a-long-demo-admin-password"


def count(db: Session, model) -> int:
    return db.scalar(select(func.count()).select_from(model))


def test_seed_creates_admin_and_catalogue(db: Session) -> None:
    report = seed(db, admin_email=ADMIN_EMAIL, admin_password=ADMIN_PASSWORD)

    admin = db.scalar(select(User).where(User.email == ADMIN_EMAIL))
    assert report.admin == "created"
    assert admin.role == Role.ADMIN
    assert verify_password(admin.password_hash, ADMIN_PASSWORD)
    assert sorted(report.created_products) == sorted(sku for sku, *_ in DEMO_PRODUCTS)
    stock = dict(db.execute(select(Product.sku, Inventory.quantity).join(Product.inventory)).all())
    assert stock == {sku: quantity for sku, _, _, quantity, _ in DEMO_PRODUCTS}
    # The ledger matches the stock from the very first unit, and records who created it.
    movements = db.scalars(select(InventoryMovement)).all()
    assert sum(m.delta for m in movements) == sum(stock.values())
    assert {m.actor_user_id for m in movements} == {admin.id}


def test_seed_is_idempotent(db: Session) -> None:
    seed(db, admin_email=ADMIN_EMAIL, admin_password=ADMIN_PASSWORD)
    counts = (count(db, User), count(db, Product), count(db, InventoryMovement))

    again = seed(db, admin_email=ADMIN_EMAIL, admin_password="a-different-password-now")

    assert again.admin == "exists"
    assert again.created_products == []
    assert (count(db, User), count(db, Product), count(db, InventoryMovement)) == counts
    admin = db.scalar(select(User).where(User.email == ADMIN_EMAIL))
    assert verify_password(admin.password_hash, ADMIN_PASSWORD)  # an existing password is never overwritten


def test_seed_never_changes_existing_products(client: TestClient, db: Session, admin_headers) -> None:
    client.post("/api/products", headers=admin_headers,
                json={"sku": "TEE-INDIGO", "name": "My own tee", "price_paise": 100, "initial_stock": 1})

    report = seed(db, admin_email=ADMIN_EMAIL, admin_password=ADMIN_PASSWORD)

    assert "TEE-INDIGO" in report.existing_products
    tee = db.scalar(select(Product).where(Product.sku == "TEE-INDIGO"))
    assert (tee.name, tee.price_paise) == ("My own tee", 100)


@pytest.mark.parametrize(
    "password",
    [None, "", "short-pw", "replace-with-a-long-demo-admin-password"],
    ids=["missing", "empty", "too-short", "placeholder-from-env-example"],
)
def test_no_admin_without_a_real_password_but_products_still_seeded(db: Session, password: str | None) -> None:
    report = seed(db, admin_email=ADMIN_EMAIL, admin_password=password)

    assert report.admin.startswith("skipped")
    assert count(db, User) == 0
    assert count(db, Product) == len(DEMO_PRODUCTS)
    assert {m.actor_user_id for m in db.scalars(select(InventoryMovement))} == {None}  # created by "the system"


def test_seed_never_promotes_an_existing_customer(db: Session) -> None:
    """Someone registers the admin email before the seed runs: they must NOT become an admin."""
    squatter = register_user(db, ADMIN_EMAIL, "squatter-pass-123")

    report = seed(db, admin_email=ADMIN_EMAIL, admin_password=ADMIN_PASSWORD)

    db.refresh(squatter)
    assert report.admin.startswith("refused")
    assert squatter.role == Role.CUSTOMER
    assert not verify_password(squatter.password_hash, ADMIN_PASSWORD)
