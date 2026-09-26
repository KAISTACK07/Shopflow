"""Small helpers that create test data through the real API."""

from itertools import count
from typing import Any

from fastapi.testclient import TestClient

_sku_numbers = count(1)


def product_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "sku": f"TEST-{next(_sku_numbers):04d}",
        "name": "Test Product",
        "description": "A product used in tests",
        "price_paise": 49900,
        "initial_stock": 10,
    }
    payload.update(overrides)
    return payload


def create_product(client: TestClient, admin_headers: dict[str, str], **overrides: Any) -> dict[str, Any]:
    response = client.post("/api/products", json=product_payload(**overrides), headers=admin_headers)
    assert response.status_code == 201, response.text
    return response.json()
