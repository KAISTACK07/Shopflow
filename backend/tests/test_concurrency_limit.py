"""Unit tests for the admission-control middleware (app.core.concurrency), on a tiny app with a slow endpoint."""

import asyncio

import httpx2 as httpx
import pytest
from fastapi import FastAPI

from app.core.concurrency import ConcurrencyLimitMiddleware

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def make_app(limit: int, queue_timeout: float) -> tuple[FastAPI, dict[str, int]]:
    stats = {"in_flight": 0, "max_in_flight": 0}
    app = FastAPI()
    app.add_middleware(
        ConcurrencyLimitMiddleware, limit=limit, queue_timeout_seconds=queue_timeout, exempt_paths=frozenset({"/health"})
    )

    @app.get("/slow")
    async def slow() -> dict[str, bool]:
        stats["in_flight"] += 1
        stats["max_in_flight"] = max(stats["max_in_flight"], stats["in_flight"])
        await asyncio.sleep(0.05)
        stats["in_flight"] -= 1
        return {"ok": True}

    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError("fails after being admitted")

    @app.get("/health")
    async def health() -> dict[str, bool]:
        return {"ok": True}

    return app, stats


def client_for(app: FastAPI) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t")


async def test_never_more_than_limit_in_flight() -> None:
    app, stats = make_app(limit=3, queue_timeout=5)
    async with client_for(app) as client:
        responses = await asyncio.gather(*(client.get("/slow") for _ in range(20)))

    assert [r.status_code for r in responses] == [200] * 20  # everyone served, by queueing
    assert stats["max_in_flight"] == 3


async def test_waiting_too_long_gets_503_with_retry_after() -> None:
    app, _ = make_app(limit=1, queue_timeout=0.01)
    async with client_for(app) as client:
        responses = await asyncio.gather(*(client.get("/slow") for _ in range(3)))

    shed = [r for r in responses if r.status_code == 503]
    assert len(shed) == 2
    assert shed[0].headers["Retry-After"] == "1"
    assert shed[0].json()["error"]["code"] == "SERVER_BUSY"


async def test_exempt_path_skips_the_queue() -> None:
    app, _ = make_app(limit=1, queue_timeout=0.01)
    async with client_for(app) as client:
        slow, health = await asyncio.gather(client.get("/slow"), client.get("/health"))

    assert (slow.status_code, health.status_code) == (200, 200)


async def test_a_failing_request_gives_its_slot_back() -> None:
    app, _ = make_app(limit=1, queue_timeout=0.5)
    async with client_for(app) as client:
        failed = await client.get("/boom")
        after = await client.get("/slow")

    assert failed.status_code == 500
    assert after.status_code == 200  # the slot wasn't leaked by the exception
