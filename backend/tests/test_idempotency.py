from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import IdempotencyKey, Inventory, Order, User
from app.schemas.order import PlaceOrderRequest
from app.services import order_service
from app.services.auth_service import register_user
from tests.concurrency import run_concurrently
from tests.conftest import auth_headers
from tests.factories import create_product

ADDRESS = "42 Residency Road, Bengaluru"


def add_to_cart(client: TestClient, headers: dict[str, str], product_id: int, quantity: int = 1) -> None:
    response = client.post("/api/cart/items", json={"product_id": product_id, "quantity": quantity}, headers=headers)
    assert response.status_code == 200, response.text


def post_order(client: TestClient, headers: dict[str, str], key: str | None, address: str = ADDRESS):
    request_headers = dict(headers)
    if key is not None:
        request_headers["Idempotency-Key"] = key
    return client.post("/api/orders", json={"shipping_address": address}, headers=request_headers)


def count(db: Session, model) -> int:
    return db.scalar(select(func.count()).select_from(model))


def stock_of(db: Session, product_id: int) -> int:
    return db.scalar(
        select(Inventory.quantity).where(Inventory.product_id == product_id).execution_options(populate_existing=True)
    )


@pytest.fixture
def product(client: TestClient, admin_headers: dict[str, str]) -> dict:
    return create_product(client, admin_headers, price_paise=25000, initial_stock=10)


# --- header validation --------------------------------------------------------------------------


def test_missing_key_is_400(client: TestClient, db: Session, product: dict, customer_headers) -> None:
    add_to_cart(client, customer_headers, product["id"])

    response = post_order(client, customer_headers, key=None)

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "IDEMPOTENCY_KEY_REQUIRED"
    assert count(db, Order) == 0


@pytest.mark.parametrize("bad_key", ["short", "has spaces in it", "semi;colon-key", "x" * 256])
def test_malformed_key_is_400(client: TestClient, db: Session, customer_headers, bad_key: str) -> None:
    response = post_order(client, customer_headers, key=bad_key)

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_IDEMPOTENCY_KEY"
    assert count(db, IdempotencyKey) == 0


# --- replay -------------------------------------------------------------------------------------


def test_same_key_same_body_replays_original_response(
    client: TestClient, db: Session, product: dict, customer_headers
) -> None:
    add_to_cart(client, customer_headers, product["id"], 2)
    key = str(uuid4())

    first = post_order(client, customer_headers, key)
    # The cart is empty now, so without idempotency this retry would be a 409 CART_EMPTY.
    retry = post_order(client, customer_headers, key)

    assert first.status_code == retry.status_code == 201
    assert retry.json() == first.json()
    assert "Idempotent-Replayed" not in first.headers
    assert retry.headers["Idempotent-Replayed"] == "true"
    assert count(db, Order) == 1
    assert stock_of(db, product["id"]) == 8  # decremented once, not twice


def test_equivalent_body_formatting_still_replays(
    client: TestClient, db: Session, product: dict, customer_headers
) -> None:
    """The hash is taken over the validated, canonical body, so surrounding whitespace doesn't matter."""
    add_to_cart(client, customer_headers, product["id"])
    key = str(uuid4())

    first = post_order(client, customer_headers, key, address=ADDRESS)
    retry = post_order(client, customer_headers, key, address=f"  {ADDRESS}  ")

    assert retry.status_code == 201
    assert retry.json()["id"] == first.json()["id"]
    assert count(db, Order) == 1


def test_same_key_different_body_is_409(client: TestClient, db: Session, product: dict, customer_headers) -> None:
    add_to_cart(client, customer_headers, product["id"])
    key = str(uuid4())
    post_order(client, customer_headers, key, address=ADDRESS)

    response = post_order(client, customer_headers, key, address="Somewhere else entirely")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "IDEMPOTENCY_KEY_REUSED"
    assert count(db, Order) == 1


def test_different_keys_are_different_orders(client: TestClient, db: Session, product: dict, customer_headers) -> None:
    for _ in range(2):
        add_to_cart(client, customer_headers, product["id"])
        assert post_order(client, customer_headers, str(uuid4())).status_code == 201

    assert count(db, Order) == 2


def test_keys_are_scoped_per_user(client: TestClient, db: Session, product: dict, customer_headers) -> None:
    """Another user sending the same key string must get their OWN order, never a replay of someone else's
    (which would also leak that person's order and address)."""
    other_headers = auth_headers(register_user(db, "other@example.com", "other-pass-123"))
    shared_key = "same-key-for-both-users"
    add_to_cart(client, customer_headers, product["id"])
    add_to_cart(client, other_headers, product["id"])

    mine = post_order(client, customer_headers, shared_key)
    theirs = post_order(client, other_headers, shared_key, address="Other user's address")

    assert mine.status_code == theirs.status_code == 201
    assert theirs.json()["id"] != mine.json()["id"]
    assert theirs.json()["shipping_address"] == "Other user's address"
    assert "Idempotent-Replayed" not in theirs.headers


# --- failures don't consume the key -------------------------------------------------------------


def test_failed_checkout_does_not_store_the_key(
    client: TestClient, db: Session, admin_headers, customer_headers
) -> None:
    scarce = create_product(client, admin_headers, initial_stock=3)
    add_to_cart(client, customer_headers, scarce["id"], 3)
    client.patch(f"/api/inventory/{scarce['id']}", json={"delta": -2, "reason": "adjustment"}, headers=admin_headers)
    key = str(uuid4())

    failed = post_order(client, customer_headers, key)
    assert failed.status_code == 409
    assert count(db, IdempotencyKey) == 0  # rolled back together with the failed order

    client.patch(f"/api/inventory/{scarce['id']}", json={"delta": 5, "reason": "restock"}, headers=admin_headers)
    retry = post_order(client, customer_headers, key)

    assert retry.status_code == 201
    assert "Idempotent-Replayed" not in retry.headers
    assert count(db, Order) == 1


# --- concurrency --------------------------------------------------------------------------------

DUPLICATES = 10


def test_simultaneous_duplicates_create_exactly_one_order(
    client: TestClient, db: Session, customer: User, product: dict
) -> None:
    """10 copies of the same request (same key, same body) arrive at once, like a client retrying on a
    timeout while the first attempt is still running. The unique (user_id, key) index makes 9 of them wait
    for the first to commit, then replay its response."""
    add_to_cart(client, auth_headers(customer), product["id"], 2)
    key = str(uuid4())
    request = PlaceOrderRequest(shipping_address=ADDRESS)
    results: list[order_service.CheckoutResult] = []

    outcomes = run_concurrently(
        [
            lambda s: results.append(order_service.checkout(s, s.get(User, customer.id), request, key))
            for _ in range(DUPLICATES)
        ]
    )

    assert outcomes == ["ok"] * DUPLICATES
    assert count(db, Order) == 1
    assert stock_of(db, product["id"]) == 8
    assert sorted(r.replayed for r in results) == [False] + [True] * (DUPLICATES - 1)
    assert len({r.body["id"] for r in results}) == 1  # everyone got the same order
