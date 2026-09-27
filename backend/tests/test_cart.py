import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Cart, CartItem, User
from app.services import cart_service
from app.services.auth_service import register_user
from tests.concurrency import run_concurrently
from tests.conftest import auth_headers
from tests.factories import create_product


def add(client: TestClient, headers: dict[str, str], product_id: int, quantity: int = 1):
    return client.post("/api/cart/items", json={"product_id": product_id, "quantity": quantity}, headers=headers)


# --- reading ------------------------------------------------------------------------------------


def test_new_user_has_empty_cart_and_no_row_is_created(
    client: TestClient, db: Session, customer_headers: dict[str, str]
) -> None:
    response = client.get("/api/cart", headers=customer_headers)

    assert response.status_code == 200
    assert response.json() == {"items": [], "total_quantity": 0, "subtotal_paise": 0, "has_unavailable_items": False}
    assert db.scalar(select(func.count(Cart.id))) == 0  # GET never writes


def test_cart_requires_login(client: TestClient) -> None:
    assert client.get("/api/cart").status_code == 401
    assert client.post("/api/cart/items", json={"product_id": 1}).status_code == 401


# --- adding -------------------------------------------------------------------------------------


def test_add_items_and_totals_are_computed_by_server(
    client: TestClient, admin_headers: dict[str, str], customer_headers: dict[str, str]
) -> None:
    tee = create_product(client, admin_headers, name="Tee", price_paise=49900, initial_stock=10)
    mug = create_product(client, admin_headers, name="Mug", price_paise=29900, initial_stock=10)

    add(client, customer_headers, tee["id"], 2)
    response = add(client, customer_headers, mug["id"], 3)

    assert response.status_code == 200
    cart = response.json()
    assert [(i["product_id"], i["quantity"], i["line_total_paise"]) for i in cart["items"]] == [
        (tee["id"], 2, 99800),
        (mug["id"], 3, 89700),
    ]
    assert cart["total_quantity"] == 5
    assert cart["subtotal_paise"] == 99800 + 89700


def test_adding_same_product_again_increases_quantity(
    client: TestClient, admin_headers: dict[str, str], customer_headers: dict[str, str]
) -> None:
    product = create_product(client, admin_headers, initial_stock=10)

    add(client, customer_headers, product["id"], 2)
    cart = add(client, customer_headers, product["id"], 3).json()

    assert [(i["product_id"], i["quantity"]) for i in cart["items"]] == [(product["id"], 5)]


def test_cannot_add_more_than_in_stock(
    client: TestClient, admin_headers: dict[str, str], customer_headers: dict[str, str]
) -> None:
    product = create_product(client, admin_headers, initial_stock=3)
    add(client, customer_headers, product["id"], 2)

    response = add(client, customer_headers, product["id"], 2)  # 2 + 2 > 3

    assert response.status_code == 409
    assert response.json()["error"]["details"] == [{"product_id": product["id"], "requested": 4, "available": 3}]
    cart = client.get("/api/cart", headers=customer_headers).json()
    assert cart["items"][0]["quantity"] == 2  # unchanged: the whole add was rolled back


def test_per_product_cart_limit(
    client: TestClient, admin_headers: dict[str, str], customer_headers: dict[str, str]
) -> None:
    product = create_product(client, admin_headers, initial_stock=500)
    add(client, customer_headers, product["id"], 60)

    response = add(client, customer_headers, product["id"], 50)  # 110 > 100

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CART_LIMIT_EXCEEDED"


@pytest.mark.parametrize("product_id", [999999])
def test_cannot_add_missing_product(client: TestClient, customer_headers: dict[str, str], product_id: int) -> None:
    response = add(client, customer_headers, product_id)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PRODUCT_NOT_FOUND"


def test_cannot_add_inactive_product(
    client: TestClient, admin_headers: dict[str, str], customer_headers: dict[str, str]
) -> None:
    product = create_product(client, admin_headers)
    client.delete(f"/api/products/{product['id']}", headers=admin_headers)

    assert add(client, customer_headers, product["id"]).status_code == 404


@pytest.mark.parametrize(
    "body",
    [
        pytest.param({"product_id": 1, "quantity": 0}, id="zero"),
        pytest.param({"product_id": 1, "quantity": -1}, id="negative"),
        pytest.param({"product_id": 1, "quantity": 101}, id="over-max"),
        pytest.param({"product_id": 1, "quantity": 1.5}, id="fractional"),
        pytest.param({"quantity": 1}, id="missing-product"),
        pytest.param({"product_id": 1, "price_paise": 1}, id="client-sent-price"),
    ],
)
def test_invalid_add_is_422(client: TestClient, customer_headers: dict[str, str], body: dict) -> None:
    assert client.post("/api/cart/items", json=body, headers=customer_headers).status_code == 422


# --- changing and removing ----------------------------------------------------------------------


def test_set_quantity(client: TestClient, admin_headers: dict[str, str], customer_headers: dict[str, str]) -> None:
    product = create_product(client, admin_headers, price_paise=1000, initial_stock=10)
    add(client, customer_headers, product["id"], 5)

    response = client.patch(f"/api/cart/items/{product['id']}", json={"quantity": 2}, headers=customer_headers)

    assert response.status_code == 200
    assert response.json()["items"][0]["quantity"] == 2
    assert response.json()["subtotal_paise"] == 2000


def test_set_quantity_checks_stock_and_membership(
    client: TestClient, admin_headers: dict[str, str], customer_headers: dict[str, str]
) -> None:
    in_cart = create_product(client, admin_headers, initial_stock=3)
    not_in_cart = create_product(client, admin_headers, initial_stock=3)
    add(client, customer_headers, in_cart["id"], 1)

    too_many = client.patch(f"/api/cart/items/{in_cart['id']}", json={"quantity": 4}, headers=customer_headers)
    missing = client.patch(f"/api/cart/items/{not_in_cart['id']}", json={"quantity": 1}, headers=customer_headers)
    zero = client.patch(f"/api/cart/items/{in_cart['id']}", json={"quantity": 0}, headers=customer_headers)

    assert too_many.status_code == 409
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "CART_ITEM_NOT_FOUND"
    assert zero.status_code == 422  # removing is DELETE's job


def test_cannot_change_quantity_of_deactivated_product(
    client: TestClient, admin_headers: dict[str, str], customer_headers: dict[str, str]
) -> None:
    product = create_product(client, admin_headers)
    add(client, customer_headers, product["id"], 1)
    client.delete(f"/api/products/{product['id']}", headers=admin_headers)

    response = client.patch(f"/api/cart/items/{product['id']}", json={"quantity": 2}, headers=customer_headers)
    removal = client.delete(f"/api/cart/items/{product['id']}", headers=customer_headers)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PRODUCT_UNAVAILABLE"
    assert removal.status_code == 200  # but it can always be removed


def test_remove_item(client: TestClient, admin_headers: dict[str, str], customer_headers: dict[str, str]) -> None:
    product = create_product(client, admin_headers)
    add(client, customer_headers, product["id"], 2)

    first = client.delete(f"/api/cart/items/{product['id']}", headers=customer_headers)
    second = client.delete(f"/api/cart/items/{product['id']}", headers=customer_headers)

    assert first.status_code == 200
    assert first.json()["items"] == []
    assert second.status_code == 404


# --- server-side truth --------------------------------------------------------------------------


def test_cart_shows_current_price(
    client: TestClient, admin_headers: dict[str, str], customer_headers: dict[str, str]
) -> None:
    product = create_product(client, admin_headers, price_paise=1000, initial_stock=10)
    add(client, customer_headers, product["id"], 2)

    client.patch(f"/api/products/{product['id']}", json={"price_paise": 1500}, headers=admin_headers)

    assert client.get("/api/cart", headers=customer_headers).json()["subtotal_paise"] == 3000


def test_items_that_became_unavailable_are_flagged(
    client: TestClient, admin_headers: dict[str, str], customer_headers: dict[str, str]
) -> None:
    deactivated = create_product(client, admin_headers, initial_stock=10)
    sold_down = create_product(client, admin_headers, initial_stock=5)
    add(client, customer_headers, deactivated["id"], 1)
    add(client, customer_headers, sold_down["id"], 4)

    client.delete(f"/api/products/{deactivated['id']}", headers=admin_headers)
    client.patch(
        f"/api/inventory/{sold_down['id']}", json={"delta": -3, "reason": "adjustment"}, headers=admin_headers
    )

    cart = client.get("/api/cart", headers=customer_headers).json()
    availability = {i["product_id"]: (i["is_available"], i["available_quantity"]) for i in cart["items"]}
    assert availability == {deactivated["id"]: (False, 10), sold_down["id"]: (False, 2)}
    assert cart["has_unavailable_items"] is True


def test_carts_are_private(client: TestClient, db: Session, admin_headers, customer_headers) -> None:
    product = create_product(client, admin_headers)
    add(client, customer_headers, product["id"], 2)
    other = register_user(db, "other@example.com", "other-pass-123")

    other_view = client.get("/api/cart", headers=auth_headers(other)).json()
    other_delete = client.delete(f"/api/cart/items/{product['id']}", headers=auth_headers(other))

    assert other_view["items"] == []
    assert other_delete.status_code == 404
    assert client.get("/api/cart", headers=customer_headers).json()["total_quantity"] == 2


# --- concurrency --------------------------------------------------------------------------------

PARALLEL_CLICKS = 10


@pytest.mark.concurrency
def test_parallel_adds_of_same_product_are_all_counted(
    client: TestClient, db: Session, customer: User, admin_headers: dict[str, str]
) -> None:
    """10 simultaneous "add 1" requests for a brand-new cart: one cart, one item row, quantity 10.
    A read-then-write version either loses clicks or fails with a unique/primary-key violation."""
    product_id = create_product(client, admin_headers, initial_stock=50)["id"]

    results = run_concurrently(
        [
            lambda s: cart_service.add_item(s, s.get(User, customer.id), product_id, 1)
            for _ in range(PARALLEL_CLICKS)
        ]
    )

    assert results == ["ok"] * PARALLEL_CLICKS
    assert db.scalar(select(func.count(Cart.id))) == 1
    assert db.scalar(select(CartItem.quantity).where(CartItem.product_id == product_id)) == PARALLEL_CLICKS
