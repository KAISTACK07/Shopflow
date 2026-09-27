"""Admission control: never have more requests in flight than there are database connections.

Why (found by the load test: 500 simultaneous checkouts all timed out). With sync endpoints, FastAPI moves each
request through several hops on its 40-thread pool: dependencies, the endpoint, then response validation. The
request's DB session keeps its pooled connection from the first query until the response has been sent, including
while it waits for a free thread for the next hop. In a burst, every thread ended up blocked waiting for a
connection, and every connection belonged to a request waiting for a thread: nothing moved until SQLAlchemy's
30 s pool timeout, then everything failed with 500s.

The fix: admit at most `limit` requests (= the pool size) at a time. Each admitted request holds at most one
connection, so an admitted request can always get one and no thread ever blocks on the pool. Requests over the
limit wait here, on the event loop, holding neither a thread nor a connection. If one waits longer than
`queue_timeout_seconds`, it gets 503 + Retry-After instead of hanging (load shedding).

It must be a pure ASGI middleware: `await self.app(...)` covers the whole request including the session cleanup
that runs after the response is sent. A `call_next` middleware returns earlier than that.
"""

import asyncio
import logging
import weakref

from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.errors import error_response

logger = logging.getLogger(__name__)

BUSY_RETRY_AFTER_SECONDS = 1


class ConcurrencyLimitMiddleware:
    def __init__(
        self, app: ASGIApp, *, limit: int, queue_timeout_seconds: float, exempt_paths: frozenset[str] = frozenset()
    ) -> None:
        self.app = app
        self.limit = limit
        self.queue_timeout_seconds = queue_timeout_seconds
        # Health checks must answer even when the server is saturated, or the orchestrator would kill a busy but
        # healthy container. They use a DB connection too, but never hold one while waiting, so this is safe.
        self.exempt_paths = exempt_paths
        self._semaphores: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Semaphore] = (
            weakref.WeakKeyDictionary()
        )

    def _semaphore(self) -> asyncio.Semaphore:
        # One per event loop. A server process has exactly one; tests start several (TestClient, live server), and
        # asyncio primitives must not be shared between loops.
        loop = asyncio.get_running_loop()
        if loop not in self._semaphores:
            self._semaphores[loop] = asyncio.Semaphore(self.limit)
        return self._semaphores[loop]

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"] in self.exempt_paths:
            await self.app(scope, receive, send)
            return

        semaphore = self._semaphore()
        try:
            async with asyncio.timeout(self.queue_timeout_seconds):
                await semaphore.acquire()
        except TimeoutError:
            logger.warning("server busy: request shed after waiting", extra={"path": scope["path"]})
            response = error_response(
                503,
                "SERVER_BUSY",
                "The server is busy. Try again in a moment.",
                headers={"Retry-After": str(BUSY_RETRY_AFTER_SECONDS)},
            )
            await response(scope, receive, send)
            return

        try:
            await self.app(scope, receive, send)
        finally:
            semaphore.release()
