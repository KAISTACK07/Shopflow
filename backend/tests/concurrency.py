"""Shared helper for concurrency tests: run actions in real threads, each with its own session and connection."""

import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor

import httpx2 as httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.db import SessionLocal

# Fail fast instead of hanging forever if a thread never reaches the barrier.
BARRIER_TIMEOUT_SECONDS = 15

# Every thread holds a pooled connection while it waits at the barrier, and the test's own `db` session may
# hold one more. Asking for more threads than that would leave one thread waiting for a connection that is
# never released, while the rest wait at the barrier for it: a hang (this happened, hence the check).
_settings = get_settings()
MAX_PARALLEL = _settings.db_pool_size + _settings.db_max_overflow - 1


def run_concurrently(actions: list[Callable[[Session], object]]) -> list[str]:
    """Run each action in its own thread and DB session, all released at the same moment.

    Returns "ok" or the AppError code (e.g. "INSUFFICIENT_STOCK") per action, in order. Any other exception
    (a deadlock, an IntegrityError) is re-raised and fails the test: those are the bugs we're looking for.
    """
    if len(actions) > MAX_PARALLEL:
        raise ValueError(f"{len(actions)} threads > {MAX_PARALLEL} available DB connections; use fewer threads")
    start_together = threading.Barrier(len(actions), timeout=BARRIER_TIMEOUT_SECONDS)

    def run(action: Callable[[Session], object]) -> str:
        with SessionLocal() as session:
            # Connect BEFORE the barrier. Otherwise connection setup skews start times: one thread can finish
            # its whole transaction while the others are still connecting, and the race never happens.
            # (Found when a cancel without its row lock still passed.)
            session.execute(text("SELECT 1"))
            start_together.wait()
            try:
                action(session)
                return "ok"
            except AppError as exc:
                return exc.code

    with ThreadPoolExecutor(max_workers=len(actions)) as pool:
        return list(pool.map(run, actions))


HTTP_TIMEOUT_SECONDS = 30


def fire_concurrently(
    base_url: str, requests: list[Callable[[httpx.Client], httpx.Response]]
) -> list[httpx.Response]:
    """Send each request from its own thread and HTTP connection to a live server, all at the same moment.

    Unlike `run_concurrently`, this goes through the whole stack: HTTP parsing, auth, rate limiting, the
    server's threadpool and its connection pool (where extra requests queue, as they would in production).
    """
    start_together = threading.Barrier(len(requests), timeout=BARRIER_TIMEOUT_SECONDS)

    def run(send: Callable[[httpx.Client], httpx.Response]) -> httpx.Response:
        with httpx.Client(base_url=base_url, timeout=HTTP_TIMEOUT_SECONDS) as client:
            client.get("/api/health")  # open the keep-alive connection before the barrier, for the same reason
            start_together.wait()
            return send(client)

    with ThreadPoolExecutor(max_workers=len(requests)) as pool:
        return list(pool.map(run, requests))
