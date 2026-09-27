import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from redis import Redis
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.rate_limit import FixedWindowRateLimiter, checkout_limiter
from app.core.redis import redis_client
from app.models import Order, User
from app.services.auth_service import register_user
from tests.conftest import auth_headers, requires_redis
from tests.factories import create_product

# 1_000_000 s is inside the 60-second window [999_960, 1_000_020): 20 seconds before it ends.
PINNED_NOW = 1_000_000.0
SECONDS_LEFT_IN_WINDOW = 20


def limiter(limit: int = 3, now: float = PINNED_NOW) -> FixedWindowRateLimiter:
    return FixedWindowRateLimiter(redis_client, name=f"test-{uuid4().hex[:8]}", limit=limit, window_seconds=60,
                                  clock=lambda: now)


def place_order(client: TestClient, headers: dict[str, str]):
    return client.post(
        "/api/orders", json={"shipping_address": "1 Test Lane"}, headers={**headers, "Idempotency-Key": str(uuid4())}
    )


# --- the limiter itself (real Redis) ------------------------------------------------------------


@requires_redis
def test_allows_up_to_limit_then_blocks_with_retry_after() -> None:
    rl = limiter(limit=3)

    decisions = [rl.hit("user-1") for _ in range(4)]

    assert [d.allowed for d in decisions] == [True, True, True, False]
    assert [d.remaining for d in decisions] == [2, 1, 0, 0]
    assert decisions[-1].retry_after_seconds == SECONDS_LEFT_IN_WINDOW


@requires_redis
def test_new_window_resets_the_count() -> None:
    now = [PINNED_NOW]
    rl = FixedWindowRateLimiter(redis_client, name="reset", limit=1, window_seconds=60, clock=lambda: now[0])
    assert rl.hit("u").allowed
    assert not rl.hit("u").allowed

    now[0] += SECONDS_LEFT_IN_WINDOW  # exactly the start of the next window

    assert rl.hit("u").allowed


@requires_redis
def test_counter_key_expires_on_its_own() -> None:
    rl = limiter()
    rl.hit("user-1")

    keys = redis_client.keys(f"rl:{rl.name}:user-1:*")

    assert len(keys) == 1
    assert 0 < redis_client.ttl(keys[0]) <= 60  # old windows clean themselves up


@requires_redis
def test_identifiers_are_counted_separately() -> None:
    rl = limiter(limit=1)

    assert rl.hit("alice").allowed
    assert not rl.hit("alice").allowed
    assert rl.hit("bob").allowed


@pytest.mark.concurrency
@requires_redis
def test_concurrent_hits_are_counted_exactly() -> None:
    """30 threads hit a limit of 10 at the same moment: INCR is atomic, so exactly 10 are allowed.
    (A GET-then-SET counter would let several threads read the same value and over-admit.)"""
    rl = limiter(limit=10)
    start_together = threading.Barrier(30, timeout=15)

    def hit() -> bool:
        start_together.wait()
        return rl.hit("burst").allowed

    with ThreadPoolExecutor(max_workers=30) as pool:
        allowed = list(pool.map(lambda _: hit(), range(30)))

    assert allowed.count(True) == 10


# --- on the checkout endpoint -------------------------------------------------------------------


@pytest.fixture
def strict_checkout_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    """2 checkout attempts per window, with the clock pinned so Retry-After is predictable."""
    monkeypatch.setattr(checkout_limiter, "limit", 2)
    monkeypatch.setattr(checkout_limiter, "clock", lambda: PINNED_NOW)


@requires_redis
def test_checkout_returns_429_with_retry_after(
    client: TestClient, db: Session, strict_checkout_limit, admin_headers, customer_headers
) -> None:
    # Every attempt counts, even ones that fail (here: empty cart → 409).
    assert place_order(client, customer_headers).status_code == 409
    assert place_order(client, customer_headers).status_code == 409
    product = create_product(client, admin_headers)
    client.post("/api/cart/items", json={"product_id": product["id"]}, headers=customer_headers)

    response = place_order(client, customer_headers)

    assert response.status_code == 429
    assert response.headers["Retry-After"] == str(SECONDS_LEFT_IN_WINDOW)
    assert response.json()["error"] == {
        "code": "RATE_LIMITED",
        "message": f"Too many checkout attempts; try again in {SECONDS_LEFT_IN_WINDOW} seconds",
        "details": {"limit": 2, "retry_after_seconds": SECONDS_LEFT_IN_WINDOW},
    }
    assert db.scalar(select(func.count(Order.id))) == 0  # a limited request never reaches the checkout


@requires_redis
def test_limit_is_per_user(client: TestClient, db: Session, strict_checkout_limit, customer_headers) -> None:
    for _ in range(3):
        place_order(client, customer_headers)
    other = auth_headers(register_user(db, "other@example.com", "other-pass-123"))

    assert place_order(client, customer_headers).status_code == 429
    assert place_order(client, other).status_code == 409  # not limited: just an empty cart


@requires_redis
def test_only_checkout_is_limited(client: TestClient, strict_checkout_limit, customer_headers) -> None:
    for _ in range(3):
        place_order(client, customer_headers)

    assert client.get("/api/orders", headers=customer_headers).status_code == 200
    assert client.get("/api/cart", headers=customer_headers).status_code == 200


def test_anonymous_checkout_is_401_not_429(client: TestClient) -> None:
    """Auth runs first: the limiter needs to know who is calling."""
    response = client.post("/api/orders", json={"shipping_address": "x"}, headers={"Idempotency-Key": str(uuid4())})

    assert response.status_code == 401


def test_checkout_fails_open_when_redis_is_down(
    client: TestClient, db: Session, customer: User, monkeypatch: pytest.MonkeyPatch, caplog, admin_headers,
    customer_headers,
) -> None:
    """Point the limiter at a Redis that isn't there: the order still goes through, with a warning logged."""
    unreachable = Redis(host="127.0.0.1", port=1, socket_connect_timeout=0.2, socket_timeout=0.2)
    monkeypatch.setattr(checkout_limiter, "redis", unreachable)
    product = create_product(client, admin_headers)
    client.post("/api/cart/items", json={"product_id": product["id"]}, headers=customer_headers)

    with caplog.at_level(logging.WARNING, logger="app.api.deps"):
        response = place_order(client, customer_headers)

    assert response.status_code == 201
    assert any("fail open" in record.getMessage() for record in caplog.records)
