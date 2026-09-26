import json
import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from redis import RedisError

from app.api.routes import health as health_module
from app.core.errors import register_exception_handlers
from app.core.logging import JsonFormatter
from app.core.middleware import request_context_middleware
from tests.conftest import requires_redis


@requires_redis
def test_health_ok_when_db_and_redis_are_up(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "checks": {"database": "ok", "redis": "ok"}}


def test_health_degraded_when_redis_is_down(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    def failing_ping() -> None:
        raise RedisError("connection refused")

    monkeypatch.setattr(health_module.redis_client, "ping", failing_ping)

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "degraded", "checks": {"database": "ok", "redis": "down"}}


def test_response_carries_generated_request_id(client: TestClient) -> None:
    response = client.get("/api/health")

    assert len(response.headers["X-Request-ID"]) == 32  # uuid4 hex


def test_valid_incoming_request_id_is_reused(client: TestClient) -> None:
    response = client.get("/api/health", headers={"X-Request-ID": "trace-abc.123"})

    assert response.headers["X-Request-ID"] == "trace-abc.123"


def test_unsafe_incoming_request_id_is_replaced(client: TestClient) -> None:
    response = client.get("/api/health", headers={"X-Request-ID": "bad id\twith spaces"})

    assert response.headers["X-Request-ID"] != "bad id\twith spaces"
    assert len(response.headers["X-Request-ID"]) == 32


def test_unknown_route_uses_error_envelope(client: TestClient) -> None:
    response = client.get("/api/does-not-exist")

    assert response.status_code == 404
    assert response.json() == {"error": {"code": "NOT_FOUND", "message": "Not Found", "details": None}}


def test_unhandled_exception_returns_generic_500_without_traceback() -> None:
    app = FastAPI()
    register_exception_handlers(app)
    app.middleware("http")(request_context_middleware)

    @app.get("/boom")
    def boom() -> None:
        raise RuntimeError("secret internal detail")

    with TestClient(app) as client:
        response = client.get("/boom")

    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred", "details": None}
    }
    assert "secret internal detail" not in response.text
    assert "X-Request-ID" in response.headers


def test_json_formatter_includes_extra_fields() -> None:
    record = logging.LogRecord("shopflow.test", logging.INFO, __file__, 1, "request", None, None)
    record.status = 201

    entry = json.loads(JsonFormatter().format(record))

    assert entry["message"] == "request"
    assert entry["level"] == "INFO"
    assert entry["status"] == 201
    assert "request_id" in entry
