import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from app.db import engine
from app.models import InventoryMovement, MovementReason
from tests.factories import create_product, product_payload

# --- create -------------------------------------------------------------------------------------


def test_admin_creates_product_with_stock_and_ledger_entry(
    client: TestClient, db: Session, admin_headers: dict[str, str]
) -> None:
    response = client.post(
        "/api/products",
        json=product_payload(sku=" tshirt-blk-m ", name="  Black T-shirt ", price_paise=49900, initial_stock=25),
        headers=admin_headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["sku"] == "TSHIRT-BLK-M"  # normalised: trimmed and upper-cased
    assert body["name"] == "Black T-shirt"
    assert body["price_paise"] == 49900
    assert body["stock_quantity"] == 25
    assert body["is_active"] is True

    movements = db.scalars(select(InventoryMovement).where(InventoryMovement.product_id == body["id"])).all()
    assert [(m.delta, m.reason) for m in movements] == [(25, MovementReason.RESTOCK)]


def test_product_without_initial_stock_has_no_ledger_entry(
    client: TestClient, db: Session, admin_headers: dict[str, str]
) -> None:
    product = create_product(client, admin_headers, initial_stock=0)

    assert product["stock_quantity"] == 0
    assert db.scalars(select(InventoryMovement)).all() == []


def test_customer_cannot_create_product(client: TestClient, customer_headers: dict[str, str]) -> None:
    response = client.post("/api/products", json=product_payload(), headers=customer_headers)

    assert response.status_code == 403


def test_anonymous_cannot_create_product(client: TestClient) -> None:
    assert client.post("/api/products", json=product_payload()).status_code == 401


@pytest.mark.parametrize(
    "overrides",
    [
        pytest.param({"price_paise": 0}, id="zero-price"),
        pytest.param({"price_paise": -100}, id="negative-price"),
        pytest.param({"price_paise": 499.5}, id="fractional-paise"),
        pytest.param({"price_paise": 100_000_001}, id="price-over-max"),
        pytest.param({"sku": "BAD SKU"}, id="sku-with-space"),
        pytest.param({"sku": "AB"}, id="sku-too-short"),
        pytest.param({"sku": "TSHIRT--BLK"}, id="sku-double-hyphen"),
        pytest.param({"name": "   "}, id="blank-name"),
        pytest.param({"initial_stock": -1}, id="negative-stock"),
        pytest.param({"stock_quantity": 5}, id="unknown-field"),
    ],
)
def test_invalid_product_input_is_422(client: TestClient, admin_headers: dict[str, str], overrides: dict) -> None:
    response = client.post("/api/products", json=product_payload(**overrides), headers=admin_headers)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_duplicate_sku_is_409_even_with_different_case(client: TestClient, admin_headers: dict[str, str]) -> None:
    create_product(client, admin_headers, sku="MUG-WHITE")

    response = client.post("/api/products", json=product_payload(sku="mug-white"), headers=admin_headers)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "SKU_ALREADY_EXISTS"


# --- read ---------------------------------------------------------------------------------------


def test_anyone_can_get_active_product(client: TestClient, admin_headers: dict[str, str]) -> None:
    product = create_product(client, admin_headers)

    response = client.get(f"/api/products/{product['id']}")

    assert response.status_code == 200
    assert response.json() == product


def test_missing_product_is_404(client: TestClient) -> None:
    response = client.get("/api/products/999999")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PRODUCT_NOT_FOUND"


def test_list_paginates_newest_first(client: TestClient, admin_headers: dict[str, str]) -> None:
    ids = [create_product(client, admin_headers)["id"] for _ in range(25)]

    first = client.get("/api/products", params={"limit": 10, "offset": 0}).json()
    last = client.get("/api/products", params={"limit": 10, "offset": 20}).json()

    assert first["total"] == last["total"] == 25
    assert [p["id"] for p in first["items"]] == ids[::-1][:10]
    assert [p["id"] for p in last["items"]] == ids[::-1][20:]


def test_list_uses_constant_number_of_queries(client: TestClient, admin_headers: dict[str, str]) -> None:
    """Guards against N+1: stock is loaded with the products, not with one extra query per product."""
    for _ in range(15):
        create_product(client, admin_headers)
    statements: list[str] = []

    def record(conn, cursor, statement, parameters, context, executemany) -> None:
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    try:
        response = client.get("/api/products", params={"limit": 15})
    finally:
        event.remove(engine, "before_cursor_execute", record)

    assert len(response.json()["items"]) == 15
    assert len(statements) == 2, statements  # one COUNT, one SELECT products JOIN inventory


@pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 101}, {"offset": -1}])
def test_invalid_pagination_is_422(client: TestClient, params: dict) -> None:
    assert client.get("/api/products", params=params).status_code == 422


def test_search_matches_name_or_sku_case_insensitively(client: TestClient, admin_headers: dict[str, str]) -> None:
    mug = create_product(client, admin_headers, sku="MUG-WHITE", name="Ceramic Mug")
    tee = create_product(client, admin_headers, sku="TSHIRT-BLK-M", name="Black T-shirt")
    create_product(client, admin_headers, sku="CAP-RED", name="Red Cap")

    by_name = client.get("/api/products", params={"q": "ceramic"}).json()
    by_sku = client.get("/api/products", params={"q": "tshirt"}).json()

    assert [p["id"] for p in by_name["items"]] == [mug["id"]]
    assert [p["id"] for p in by_sku["items"]] == [tee["id"]]
    assert by_name["total"] == by_sku["total"] == 1


def test_search_treats_wildcards_literally(client: TestClient, admin_headers: dict[str, str]) -> None:
    discount = create_product(client, admin_headers, name="50% off bundle")
    create_product(client, admin_headers, name="Plain bundle")

    percent = client.get("/api/products", params={"q": "%"}).json()
    underscore = client.get("/api/products", params={"q": "_"}).json()

    assert [p["id"] for p in percent["items"]] == [discount["id"]]  # not "match everything"
    assert underscore["total"] == 0


# --- update -------------------------------------------------------------------------------------


def test_admin_updates_only_sent_fields(client: TestClient, admin_headers: dict[str, str]) -> None:
    product = create_product(client, admin_headers, name="Old name", price_paise=1000)

    response = client.patch(f"/api/products/{product['id']}", json={"price_paise": 1500}, headers=admin_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["price_paise"] == 1500
    assert body["name"] == "Old name"
    assert body["updated_at"] > product["updated_at"]


@pytest.mark.parametrize(
    "patch",
    [
        pytest.param({"name": None}, id="null-name"),
        pytest.param({"sku": "NEW-SKU"}, id="sku-is-immutable"),
        pytest.param({"stock_quantity": 99}, id="stock-not-editable-here"),
        pytest.param({"price_paise": 0}, id="zero-price"),
    ],
)
def test_invalid_update_is_422(client: TestClient, admin_headers: dict[str, str], patch: dict) -> None:
    product = create_product(client, admin_headers)

    response = client.patch(f"/api/products/{product['id']}", json=patch, headers=admin_headers)

    assert response.status_code == 422


def test_customer_cannot_update(client: TestClient, admin_headers, customer_headers) -> None:
    product = create_product(client, admin_headers)

    response = client.patch(f"/api/products/{product['id']}", json={"name": "Hacked"}, headers=customer_headers)

    assert response.status_code == 403


def test_update_missing_product_is_404(client: TestClient, admin_headers: dict[str, str]) -> None:
    assert client.patch("/api/products/999999", json={"name": "x"}, headers=admin_headers).status_code == 404


# --- deactivate (soft delete) -------------------------------------------------------------------


def test_deactivated_product_is_hidden_from_customers_but_visible_to_admins(
    client: TestClient, admin_headers: dict[str, str], customer_headers: dict[str, str]
) -> None:
    product = create_product(client, admin_headers)

    assert client.delete(f"/api/products/{product['id']}", headers=admin_headers).status_code == 204

    assert client.get(f"/api/products/{product['id']}").status_code == 404
    assert client.get(f"/api/products/{product['id']}", headers=customer_headers).status_code == 404
    assert client.get("/api/products").json()["total"] == 0

    admin_view = client.get(f"/api/products/{product['id']}", headers=admin_headers)
    assert admin_view.status_code == 200
    assert admin_view.json()["is_active"] is False
    admin_list = client.get("/api/products", params={"include_inactive": True}, headers=admin_headers).json()
    assert [p["id"] for p in admin_list["items"]] == [product["id"]]


def test_deactivate_is_idempotent_and_reversible(client: TestClient, admin_headers: dict[str, str]) -> None:
    product = create_product(client, admin_headers)
    url = f"/api/products/{product['id']}"

    assert client.delete(url, headers=admin_headers).status_code == 204
    assert client.delete(url, headers=admin_headers).status_code == 204

    reactivated = client.patch(url, json={"is_active": True}, headers=admin_headers)
    assert reactivated.json()["is_active"] is True
    assert client.get(url).status_code == 200


def test_customer_cannot_list_inactive_products(client: TestClient, customer_headers: dict[str, str]) -> None:
    response = client.get("/api/products", params={"include_inactive": True}, headers=customer_headers)

    assert response.status_code == 403


def test_customer_cannot_delete(client: TestClient, admin_headers, customer_headers) -> None:
    product = create_product(client, admin_headers)

    assert client.delete(f"/api/products/{product['id']}", headers=customer_headers).status_code == 403


def test_expired_token_on_public_endpoint_is_401_not_silently_anonymous(client: TestClient) -> None:
    response = client.get("/api/products", headers={"Authorization": "Bearer expired.or.garbage"})

    assert response.status_code == 401
