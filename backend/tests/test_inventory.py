from collections import Counter

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Inventory, InventoryMovement, User
from app.schemas.inventory import StockAdjustment
from app.services import inventory_service
from tests.concurrency import run_concurrently
from tests.factories import create_product


def adjust(client: TestClient, headers: dict[str, str], product_id: int, **body):
    return client.patch(f"/api/inventory/{product_id}", json=body, headers=headers)


def ledger_sum(db: Session, product_id: int) -> int:
    return db.scalar(select(func.sum(InventoryMovement.delta)).where(InventoryMovement.product_id == product_id))


def stock_of(db: Session, product_id: int) -> int:
    return db.scalar(select(Inventory.quantity).where(Inventory.product_id == product_id))


# --- adjustments --------------------------------------------------------------------------------


def test_restock_adds_stock_and_records_movement(
    client: TestClient, db: Session, admin: User, admin_headers: dict[str, str]
) -> None:
    product = create_product(client, admin_headers, initial_stock=5)

    response = adjust(client, admin_headers, product["id"], delta=20, reason="restock", note="PO-1042")

    assert response.status_code == 200
    assert response.json()["quantity"] == 25
    latest = db.scalars(select(InventoryMovement).order_by(InventoryMovement.id.desc())).first()
    assert (latest.delta, latest.reason, latest.note, latest.actor_user_id) == (20, "restock", "PO-1042", admin.id)


def test_negative_adjustment_removes_stock(client: TestClient, db: Session, admin_headers: dict[str, str]) -> None:
    product = create_product(client, admin_headers, initial_stock=10)

    response = adjust(client, admin_headers, product["id"], delta=-3, reason="adjustment", note="damaged")

    assert response.json()["quantity"] == 7
    assert ledger_sum(db, product["id"]) == 7


def test_removing_more_than_available_is_409_and_changes_nothing(
    client: TestClient, db: Session, admin_headers: dict[str, str]
) -> None:
    product = create_product(client, admin_headers, initial_stock=2)

    response = adjust(client, admin_headers, product["id"], delta=-3, reason="adjustment")

    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "INSUFFICIENT_STOCK"
    assert error["details"] == [{"product_id": product["id"], "requested": 3, "available": 2}]
    assert stock_of(db, product["id"]) == 2
    assert ledger_sum(db, product["id"]) == 2  # no movement was written


def test_threshold_only_update_writes_no_movement(
    client: TestClient, db: Session, admin_headers: dict[str, str]
) -> None:
    product = create_product(client, admin_headers, initial_stock=10)

    response = adjust(client, admin_headers, product["id"], low_stock_threshold=12)

    assert response.status_code == 200
    assert response.json()["low_stock_threshold"] == 12
    assert response.json()["is_low_stock"] is True
    assert db.scalar(select(func.count(InventoryMovement.id))) == 1  # only the initial restock


@pytest.mark.parametrize(
    "body",
    [
        pytest.param({}, id="empty"),
        pytest.param({"delta": 0, "reason": "adjustment"}, id="zero-delta"),
        pytest.param({"delta": 5}, id="missing-reason"),
        pytest.param({"delta": -5, "reason": "restock"}, id="negative-restock"),
        pytest.param({"delta": 5, "reason": "order"}, id="system-only-reason-order"),
        pytest.param({"delta": 5, "reason": "cancel"}, id="system-only-reason-cancel"),
        pytest.param({"low_stock_threshold": 3, "note": "x"}, id="note-without-delta"),
        pytest.param({"delta": 1_000_001, "reason": "restock"}, id="delta-over-max"),
        pytest.param({"low_stock_threshold": -1}, id="negative-threshold"),
        pytest.param({"quantity": 50}, id="absolute-quantity-not-allowed"),
    ],
)
def test_invalid_adjustments_are_422(client: TestClient, admin_headers: dict[str, str], body: dict) -> None:
    product = create_product(client, admin_headers)

    assert adjust(client, admin_headers, product["id"], **body).status_code == 422


def test_adjusting_missing_product_is_404(client: TestClient, admin_headers: dict[str, str]) -> None:
    assert adjust(client, admin_headers, 999999, delta=1, reason="restock").status_code == 404


def test_customers_cannot_touch_inventory(
    client: TestClient, admin_headers: dict[str, str], customer_headers: dict[str, str]
) -> None:
    product = create_product(client, admin_headers)

    assert adjust(client, customer_headers, product["id"], delta=1, reason="restock").status_code == 403
    assert client.get("/api/inventory", headers=customer_headers).status_code == 403
    assert client.get(f"/api/inventory/{product['id']}/movements", headers=customer_headers).status_code == 403


# --- listing & history --------------------------------------------------------------------------


def test_low_stock_filter(client: TestClient, admin_headers: dict[str, str]) -> None:
    plenty = create_product(client, admin_headers, initial_stock=50, low_stock_threshold=5)
    at_threshold = create_product(client, admin_headers, initial_stock=5, low_stock_threshold=5)
    sold_out = create_product(client, admin_headers, initial_stock=0)

    everything = client.get("/api/inventory", headers=admin_headers).json()
    low = client.get("/api/inventory", params={"low_stock": True}, headers=admin_headers).json()

    assert everything["total"] == 3
    assert [item["product_id"] for item in low["items"]] == [at_threshold["id"], sold_out["id"]]
    assert plenty["id"] not in [item["product_id"] for item in low["items"]]


def test_movement_history_is_newest_first_and_matches_stock(
    client: TestClient, db: Session, admin_headers: dict[str, str]
) -> None:
    product = create_product(client, admin_headers, initial_stock=10)
    adjust(client, admin_headers, product["id"], delta=5, reason="restock")
    adjust(client, admin_headers, product["id"], delta=-2, reason="adjustment", note="lost in warehouse")

    history = client.get(f"/api/inventory/{product['id']}/movements", headers=admin_headers).json()

    assert [(m["delta"], m["reason"]) for m in history["items"]] == [
        (-2, "adjustment"),
        (5, "restock"),
        (10, "restock"),
    ]
    assert sum(m["delta"] for m in history["items"]) == stock_of(db, product["id"]) == 13


# --- concurrency --------------------------------------------------------------------------------

CONCURRENT_WORKERS = 16
STARTING_STOCK = 10


def test_concurrent_removals_never_oversell_or_lose_updates(
    client: TestClient, db: Session, admin: User, admin_headers: dict[str, str]
) -> None:
    """16 threads, each with its own DB connection, try to remove 1 unit from a stock of 10 at the same time.

    Without the row lock two threads can both read 10 and both write 9 (a lost update), so more than 10
    removals "succeed" and the final stock is wrong. With SELECT ... FOR UPDATE they queue on the row.
    """
    product_id = create_product(client, admin_headers, initial_stock=STARTING_STOCK)["id"]
    removal = StockAdjustment(delta=-1, reason="adjustment")

    results = run_concurrently(
        [
            lambda s: inventory_service.adjust_stock(s, product_id, removal, s.get(User, admin.id))
            for _ in range(CONCURRENT_WORKERS)
        ]
    )

    assert Counter(results) == {"ok": STARTING_STOCK, "INSUFFICIENT_STOCK": CONCURRENT_WORKERS - STARTING_STOCK}
    assert stock_of(db, product_id) == 0
    assert ledger_sum(db, product_id) == 0  # +10 initial, ten -1 movements
