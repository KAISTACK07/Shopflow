"""End-to-end concurrency tests: real concurrent HTTP requests against a live uvicorn server and PostgreSQL.

The service-level tests (test_inventory/test_cart/test_orders/test_idempotency) prove each lock in isolation;
these prove the whole stack under load: auth, rate limiting, idempotency, locking and the connection pool.
"""

import random
import time
from collections import Counter
from itertools import accumulate
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.rate_limit import checkout_limiter
from app.core.security import create_access_token
from app.models import Inventory, InventoryMovement, Order, OrderItem, User
from app.services import cart_service
from tests.concurrency import fire_concurrently
from tests.conftest import requires_redis
from tests.factories import create_product

pytestmark = [pytest.mark.concurrency, requires_redis]

ADDRESS = "1 Flash Sale Street"
# Far below the 30 s pool timeout that a stalled server would hit, far above a healthy run (~1-2 s).
BURST_TIME_LIMIT_SECONDS = 15


def make_buyers(db: Session, how_many: int) -> list[User]:
    buyers = [User(email=f"buyer{i}@example.com", password_hash="unused") for i in range(how_many)]
    db.add_all(buyers)
    db.commit()
    return buyers


def bearer(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def checkout_request(headers: dict[str, str], key: str | None = None):
    """A request factory for fire_concurrently."""
    key = key or str(uuid4())
    return lambda http: http.post(
        "/api/orders", json={"shipping_address": ADDRESS}, headers={**headers, "Idempotency-Key": key}
    )


def stock_of(db: Session, product_id: int) -> int:
    return db.scalar(
        select(Inventory.quantity).where(Inventory.product_id == product_id).execution_options(populate_existing=True)
    )


def sold_quantity(db: Session, product_id: int) -> int:
    return db.scalar(
        select(func.coalesce(func.sum(OrderItem.quantity), 0)).where(OrderItem.product_id == product_id)
    )


def assert_ledger_consistent(db: Session, product_id: int) -> None:
    """Replays the product's movements in the order they were written. Movements for one product are written
    while holding its row lock, so id order is the order the stock actually changed in. Checks:
    - the running stock never dipped below zero at ANY point (not just at the end), and
    - the ledger total equals the stock the inventory row reports."""
    deltas = db.scalars(
        select(InventoryMovement.delta).where(InventoryMovement.product_id == product_id).order_by(InventoryMovement.id)
    ).all()
    running_stock = list(accumulate(deltas))
    assert min(running_stock) >= 0, f"stock went negative: {running_stock}"
    assert running_stock[-1] == stock_of(db, product_id)


def test_flash_sale_50_buyers_10_units(live_server: str, client: TestClient, db: Session, admin_headers) -> None:
    """The spec's headline test: 50 different users try to buy the last 10 units at the same moment."""
    product_id = create_product(client, admin_headers, initial_stock=10)["id"]
    buyers = make_buyers(db, 50)
    for buyer in buyers:
        cart_service.add_item(db, buyer, product_id, 1)
    db.commit()  # end the fixture session's transaction so it doesn't hold a pooled connection

    responses = fire_concurrently(live_server, [checkout_request(bearer(buyer)) for buyer in buyers])

    assert Counter(r.status_code for r in responses) == {201: 10, 409: 40}
    assert {r.json()["error"]["code"] for r in responses if r.status_code == 409} == {"INSUFFICIENT_STOCK"}
    assert stock_of(db, product_id) == 0
    assert db.scalar(select(func.count(Order.id))) == 10
    assert sold_quantity(db, product_id) == 10
    assert_ledger_consistent(db, product_id)  # never negative at any point


BURST = 100  # comfortably more than the server's 40 worker threads + 20 pooled DB connections


def test_burst_bigger_than_the_thread_pool_does_not_stall(live_server: str, db: Session) -> None:
    """Regression test for a stall found by the load test: 500 simultaneous checkouts all timed out.

    FastAPI runs each sync dependency and the endpoint as separate hops on a 40-thread pool. A request that took a
    DB connection in `get_current_user` kept it while waiting for a thread for its next hop; once every thread was
    blocked waiting for a connection, nothing could move until SQLAlchemy's 30 s pool timeout (then 500s).
    """
    buyers = make_buyers(db, BURST)

    started = time.monotonic()
    responses = fire_concurrently(
        live_server, [lambda http, h=bearer(buyer): http.get("/api/cart", headers=h) for buyer in buyers]
    )
    elapsed = time.monotonic() - started

    assert Counter(r.status_code for r in responses) == {200: BURST}
    assert elapsed < BURST_TIME_LIMIT_SECONDS, f"took {elapsed:.1f}s"


def test_ten_simultaneous_http_duplicates_create_one_order(
    live_server: str, client: TestClient, db: Session, customer: User, monkeypatch: pytest.MonkeyPatch,
    admin_headers,
) -> None:
    monkeypatch.setattr(checkout_limiter, "limit", 100)  # this test is about idempotency, not the rate limit
    product_id = create_product(client, admin_headers, initial_stock=10)["id"]
    cart_service.add_item(db, customer, product_id, 2)
    db.commit()
    key = str(uuid4())

    responses = fire_concurrently(live_server, [checkout_request(bearer(customer), key) for _ in range(10)])

    assert [r.status_code for r in responses] == [201] * 10
    assert Counter(r.headers.get("Idempotent-Replayed", "original") for r in responses) == {"original": 1, "true": 9}
    assert len({r.json()["id"] for r in responses}) == 1
    assert db.scalar(select(func.count(Order.id))) == 1
    assert stock_of(db, product_id) == 8


def test_overlapping_multi_item_carts_never_oversell_or_deadlock(
    live_server: str, client: TestClient, db: Session, admin_headers
) -> None:
    """40 buyers with random carts over 3 scarce products (different items, quantities and insertion orders).
    Every response must be 201 or 409 (no 500 from a deadlock), and for every product the stock, the orders and
    the ledger must agree exactly."""
    rng = random.Random(20260927)  # fixed seed: the same carts on every run, so a failure can be reproduced
    initial_stock = {"A": 15, "B": 10, "C": 5}
    products = {name: create_product(client, admin_headers, initial_stock=qty)["id"] for name, qty in initial_stock.items()}
    buyers = make_buyers(db, 40)
    for buyer in buyers:
        for name in rng.sample(list(products), k=rng.randint(1, 3)):  # random subset in random order
            cart_service.add_item(db, buyer, products[name], rng.randint(1, 3))
    db.commit()

    responses = fire_concurrently(live_server, [checkout_request(bearer(buyer)) for buyer in buyers])

    statuses = Counter(r.status_code for r in responses)
    assert set(statuses) <= {201, 409}, statuses
    assert statuses[201] > 0
    for name, product_id in products.items():
        assert stock_of(db, product_id) >= 0
        assert initial_stock[name] - stock_of(db, product_id) == sold_quantity(db, product_id)
        assert_ledger_consistent(db, product_id)
