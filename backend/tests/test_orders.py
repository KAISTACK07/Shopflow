from collections import Counter

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import CartItem, Inventory, InventoryMovement, Order, OrderItem, User
from app.services import cart_service, order_service
from app.services.auth_service import register_user
from tests.concurrency import run_concurrently
from tests.conftest import auth_headers
from tests.factories import create_product

ADDRESS = "221B Baker Street, London"


def add_to_cart(client: TestClient, headers: dict[str, str], product_id: int, quantity: int = 1) -> None:
    response = client.post("/api/cart/items", json={"product_id": product_id, "quantity": quantity}, headers=headers)
    assert response.status_code == 200, response.text


def checkout(client: TestClient, headers: dict[str, str], address: str = ADDRESS):
    return client.post("/api/orders", json={"shipping_address": address}, headers=headers)


def stock_of(db: Session, product_id: int) -> int:
    return db.scalar(select(Inventory.quantity).where(Inventory.product_id == product_id).execution_options(
        populate_existing=True))


def ledger_sum(db: Session, product_id: int) -> int:
    return db.scalar(select(func.sum(InventoryMovement.delta)).where(InventoryMovement.product_id == product_id))


def count(db: Session, model) -> int:
    return db.scalar(select(func.count()).select_from(model))


# --- checkout -----------------------------------------------------------------------------------


def test_checkout_creates_order_reserves_stock_and_empties_cart(
    client: TestClient, db: Session, customer: User, admin_headers, customer_headers
) -> None:
    tee = create_product(client, admin_headers, price_paise=49900, initial_stock=10)
    mug = create_product(client, admin_headers, price_paise=29900, initial_stock=5)
    add_to_cart(client, customer_headers, tee["id"], 2)
    add_to_cart(client, customer_headers, mug["id"], 1)

    response = checkout(client, customer_headers)

    assert response.status_code == 201
    order = response.json()
    assert order["status"] == "pending"
    assert order["user_id"] == customer.id
    assert order["total_paise"] == 2 * 49900 + 29900
    assert [(i["product_id"], i["quantity"], i["unit_price_paise"]) for i in order["items"]] == [
        (tee["id"], 2, 49900),
        (mug["id"], 1, 29900),
    ]
    assert (stock_of(db, tee["id"]), stock_of(db, mug["id"])) == (8, 4)
    movements = db.scalars(select(InventoryMovement).where(InventoryMovement.order_id == order["id"])).all()
    assert sorted((m.product_id, m.delta, m.reason) for m in movements) == [
        (tee["id"], -2, "order"),
        (mug["id"], -1, "order"),
    ]
    assert client.get("/api/cart", headers=customer_headers).json()["items"] == []


def test_order_keeps_price_at_purchase(client: TestClient, admin_headers, customer_headers) -> None:
    product = create_product(client, admin_headers, price_paise=1000)
    add_to_cart(client, customer_headers, product["id"], 3)
    order = checkout(client, customer_headers).json()

    client.patch(f"/api/products/{product['id']}", json={"price_paise": 9999}, headers=admin_headers)

    again = client.get(f"/api/orders/{order['id']}", headers=customer_headers).json()
    assert again["items"][0]["unit_price_paise"] == 1000
    assert again["total_paise"] == 3000


def test_empty_cart_is_409(client: TestClient, db: Session, customer_headers) -> None:
    response = checkout(client, customer_headers)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CART_EMPTY"
    assert count(db, Order) == 0


def test_insufficient_stock_lists_every_failing_item_and_changes_nothing(
    client: TestClient, db: Session, admin_headers, customer_headers
) -> None:
    ok = create_product(client, admin_headers, initial_stock=10)
    short_a = create_product(client, admin_headers, initial_stock=5)
    short_b = create_product(client, admin_headers, initial_stock=5)
    for product, quantity in [(ok, 1), (short_a, 4), (short_b, 5)]:
        add_to_cart(client, customer_headers, product["id"], quantity)
    # Stock drops after the items were added (someone else bought them):
    for product in (short_a, short_b):
        client.patch(f"/api/inventory/{product['id']}", json={"delta": -3, "reason": "adjustment"},
                     headers=admin_headers)

    response = checkout(client, customer_headers)

    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "INSUFFICIENT_STOCK"
    assert error["details"] == [
        {"product_id": short_a["id"], "requested": 4, "available": 2, "reason": "insufficient_stock"},
        {"product_id": short_b["id"], "requested": 5, "available": 2, "reason": "insufficient_stock"},
    ]
    # All-or-nothing: no order, no stock change (not even for the item that was fine), cart untouched.
    assert count(db, Order) == 0
    assert (stock_of(db, ok["id"]), stock_of(db, short_a["id"]), stock_of(db, short_b["id"])) == (10, 2, 2)
    assert count(db, CartItem) == 3


def test_deactivated_product_in_cart_blocks_checkout(
    client: TestClient, db: Session, admin_headers, customer_headers
) -> None:
    product = create_product(client, admin_headers, initial_stock=10)
    add_to_cart(client, customer_headers, product["id"], 1)
    client.delete(f"/api/products/{product['id']}", headers=admin_headers)

    response = checkout(client, customer_headers)

    assert response.status_code == 409
    assert response.json()["error"]["details"][0]["reason"] == "product_unavailable"
    assert count(db, Order) == 0


@pytest.mark.parametrize(
    "body",
    [
        pytest.param({}, id="missing-address"),
        pytest.param({"shipping_address": "   "}, id="blank-address"),
        pytest.param({"shipping_address": "x" * 501}, id="address-too-long"),
        pytest.param({"shipping_address": ADDRESS, "total_paise": 1}, id="client-sent-total"),
    ],
)
def test_invalid_checkout_body_is_422(client: TestClient, customer_headers, body: dict) -> None:
    assert client.post("/api/orders", json=body, headers=customer_headers).status_code == 422


def test_checkout_requires_login(client: TestClient) -> None:
    assert checkout(client, {}).status_code == 401


# --- reading ------------------------------------------------------------------------------------


def test_order_history_is_per_user_and_newest_first(
    client: TestClient, db: Session, admin_headers, customer_headers
) -> None:
    product = create_product(client, admin_headers, initial_stock=10)
    other_headers = auth_headers(register_user(db, "other@example.com", "other-pass-123"))
    mine = []
    for _ in range(2):
        add_to_cart(client, customer_headers, product["id"])
        mine.append(checkout(client, customer_headers).json()["id"])
    add_to_cart(client, other_headers, product["id"])
    theirs = checkout(client, other_headers).json()["id"]

    history = client.get("/api/orders", headers=customer_headers).json()

    assert [o["id"] for o in history["items"]] == mine[::-1]
    assert history["total"] == 2
    assert client.get(f"/api/orders/{theirs}", headers=customer_headers).status_code == 404  # not 403
    assert client.get(f"/api/orders/{theirs}", headers=admin_headers).status_code == 200
    everyone = client.get("/api/orders", params={"all_users": True}, headers=admin_headers).json()
    assert everyone["total"] == 3
    assert client.get("/api/orders", params={"all_users": True}, headers=customer_headers).status_code == 403


def test_missing_order_is_404(client: TestClient, customer_headers) -> None:
    response = client.get("/api/orders/999999", headers=customer_headers)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "ORDER_NOT_FOUND"


# --- cancel & status transitions ----------------------------------------------------------------


@pytest.fixture
def placed_order(client: TestClient, admin_headers, customer_headers) -> dict:
    """A pending order for 3 units of a product that started with 10 in stock."""
    product = create_product(client, admin_headers, initial_stock=10)
    add_to_cart(client, customer_headers, product["id"], 3)
    return checkout(client, customer_headers).json()


def test_cancel_restores_stock_with_movement(
    client: TestClient, db: Session, customer: User, placed_order: dict, customer_headers
) -> None:
    product_id = placed_order["items"][0]["product_id"]
    assert stock_of(db, product_id) == 7

    response = client.post(f"/api/orders/{placed_order['id']}/cancel", headers=customer_headers)

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert stock_of(db, product_id) == 10
    cancel_movement = db.scalar(
        select(InventoryMovement).where(InventoryMovement.order_id == placed_order["id"],
                                        InventoryMovement.reason == "cancel")
    )
    assert (cancel_movement.delta, cancel_movement.actor_user_id) == (3, customer.id)
    assert ledger_sum(db, product_id) == 10


def test_cancelling_twice_is_409(client: TestClient, db: Session, placed_order: dict, customer_headers) -> None:
    url = f"/api/orders/{placed_order['id']}/cancel"
    client.post(url, headers=customer_headers)

    response = client.post(url, headers=customer_headers)

    assert response.status_code == 409
    assert response.json()["error"] == {
        "code": "INVALID_STATUS_TRANSITION",
        "message": f"Cannot change order {placed_order['id']} from cancelled to cancelled",
        "details": {"from": "cancelled", "to": "cancelled"},
    }
    assert stock_of(db, placed_order["items"][0]["product_id"]) == 10  # returned once, not twice


def test_other_customer_cannot_cancel(client: TestClient, db: Session, placed_order: dict) -> None:
    stranger = auth_headers(register_user(db, "stranger@example.com", "stranger-pass-1"))

    assert client.post(f"/api/orders/{placed_order['id']}/cancel", headers=stranger).status_code == 404


def test_admin_moves_order_through_happy_path(client: TestClient, placed_order: dict, admin_headers) -> None:
    url = f"/api/orders/{placed_order['id']}/status"

    confirmed = client.patch(url, json={"status": "confirmed"}, headers=admin_headers)
    shipped = client.patch(url, json={"status": "shipped"}, headers=admin_headers)

    assert (confirmed.status_code, confirmed.json()["status"]) == (200, "confirmed")
    assert (shipped.status_code, shipped.json()["status"]) == (200, "shipped")


@pytest.mark.parametrize(
    ("path", "target"),
    [
        pytest.param([], "shipped", id="pending-to-shipped-skips-confirm"),
        pytest.param([], "pending", id="pending-to-pending"),
        pytest.param(["confirmed"], "pending", id="confirmed-back-to-pending"),
        pytest.param(["confirmed", "shipped"], "cancelled", id="cannot-cancel-shipped"),
        pytest.param(["confirmed", "shipped"], "confirmed", id="shipped-back-to-confirmed"),
        pytest.param(["cancelled"], "confirmed", id="cancelled-is-terminal"),
    ],
)
def test_invalid_transitions_are_409(
    client: TestClient, db: Session, placed_order: dict, admin_headers, path: list[str], target: str
) -> None:
    url = f"/api/orders/{placed_order['id']}/status"
    for status in path:
        assert client.patch(url, json={"status": status}, headers=admin_headers).status_code == 200
    stock_before = stock_of(db, placed_order["items"][0]["product_id"])

    response = client.patch(url, json={"status": target}, headers=admin_headers)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "INVALID_STATUS_TRANSITION"
    assert stock_of(db, placed_order["items"][0]["product_id"]) == stock_before


def test_customer_can_cancel_confirmed_order_but_not_shipped(
    client: TestClient, placed_order: dict, admin_headers, customer_headers
) -> None:
    status_url = f"/api/orders/{placed_order['id']}/status"
    cancel_url = f"/api/orders/{placed_order['id']}/cancel"
    client.patch(status_url, json={"status": "confirmed"}, headers=admin_headers)
    assert client.post(cancel_url, headers=customer_headers).status_code == 200

    product_id = placed_order["items"][0]["product_id"]
    add_to_cart(client, customer_headers, product_id, 1)
    second = checkout(client, customer_headers).json()
    client.patch(f"/api/orders/{second['id']}/status", json={"status": "confirmed"}, headers=admin_headers)
    client.patch(f"/api/orders/{second['id']}/status", json={"status": "shipped"}, headers=admin_headers)
    assert client.post(f"/api/orders/{second['id']}/cancel", headers=customer_headers).status_code == 409


def test_admin_cancel_via_status_endpoint_restores_stock(
    client: TestClient, db: Session, placed_order: dict, admin_headers
) -> None:
    response = client.patch(
        f"/api/orders/{placed_order['id']}/status", json={"status": "cancelled"}, headers=admin_headers
    )

    assert response.json()["status"] == "cancelled"
    assert stock_of(db, placed_order["items"][0]["product_id"]) == 10


def test_customer_cannot_change_status(client: TestClient, placed_order: dict, customer_headers) -> None:
    response = client.patch(
        f"/api/orders/{placed_order['id']}/status", json={"status": "confirmed"}, headers=customer_headers
    )

    assert response.status_code == 403


# --- concurrency (service level; the 50-buyer HTTP test comes with the full test suite) -----------


def make_buyers(db: Session, how_many: int) -> list[User]:
    # Direct inserts: these users never log in, so skip the (deliberately slow) password hashing.
    buyers = [User(email=f"buyer{i}@example.com", password_hash="unused") for i in range(how_many)]
    db.add_all(buyers)
    db.commit()
    return buyers


def test_fifteen_buyers_five_units_exactly_five_orders(client: TestClient, db: Session, admin_headers) -> None:
    product_id = create_product(client, admin_headers, initial_stock=5)["id"]
    buyers = make_buyers(db, 15)
    for buyer in buyers:
        cart_service.add_item(db, buyer, product_id, 1)

    results = run_concurrently(
        [lambda s, b=buyer: order_service.place_order(s, s.get(User, b.id), ADDRESS) for buyer in buyers]
    )

    assert Counter(results) == {"ok": 5, "INSUFFICIENT_STOCK": 10}
    assert stock_of(db, product_id) == 0
    assert db.scalar(select(func.sum(OrderItem.quantity))) == 5
    assert ledger_sum(db, product_id) == 0


def test_same_cart_checked_out_twice_at_once_gives_one_order(
    client: TestClient, db: Session, customer: User, admin_headers
) -> None:
    product_id = create_product(client, admin_headers, initial_stock=10)["id"]
    cart_service.add_item(db, customer, product_id, 2)

    results = run_concurrently(
        [lambda s: order_service.place_order(s, s.get(User, customer.id), ADDRESS) for _ in range(5)]
    )

    assert Counter(results) == {"ok": 1, "CART_EMPTY": 4}
    assert count(db, Order) == 1
    assert stock_of(db, product_id) == 8


def test_parallel_cancels_return_stock_once(
    client: TestClient, db: Session, customer: User, placed_order: dict
) -> None:
    order_id = placed_order["id"]

    results = run_concurrently(
        [lambda s: order_service.cancel_order(s, s.get(User, customer.id), order_id) for _ in range(5)]
    )

    assert Counter(results) == {"ok": 1, "INVALID_STATUS_TRANSITION": 4}
    assert stock_of(db, placed_order["items"][0]["product_id"]) == 10


def test_checkout_and_cart_edits_racing_never_deadlock(
    client: TestClient, db: Session, admin_headers
) -> None:
    """Each round: a checkout and a quantity change on the same cart at the same moment. Both lock the cart row
    first, so they queue. If an edit locked the item row before the cart row, PostgreSQL would detect a
    deadlock and abort one of them (a 500 for the user; here, a DeadlockDetected that fails the test)."""
    product_id = create_product(client, admin_headers, initial_stock=1000)["id"]
    buyers = make_buyers(db, 15)
    outcomes: Counter = Counter()
    for buyer in buyers:
        cart_service.add_item(db, buyer, product_id, 1)
        outcomes.update(
            run_concurrently(
                [
                    lambda s, b=buyer: order_service.place_order(s, s.get(User, b.id), ADDRESS),
                    lambda s, b=buyer: cart_service.set_item_quantity(s, s.get(User, b.id), product_id, 2),
                ]
            )
        )

    # The checkout always succeeds; the edit either runs first (ok) or finds the item already gone (404).
    assert outcomes["ok"] >= len(buyers)
    assert set(outcomes) <= {"ok", "CART_ITEM_NOT_FOUND"}
    assert count(db, Order) == len(buyers)
