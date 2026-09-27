"""Request middleware: assigns a request id, logs method/path/status/latency, turns crashes into a clean 500."""

import logging
import re
import time
import uuid
from collections.abc import Awaitable, Callable

from fastapi import Request, Response

from app.core.errors import error_response
from app.core.logging import request_id_var

logger = logging.getLogger("shopflow.request")

REQUEST_ID_HEADER = "X-Request-ID"
HEALTH_PATH = "/api/health"
# Accept a caller's id only if it is short and harmless; otherwise generate our own.
_VALID_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


async def request_context_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    incoming_id = request.headers.get(REQUEST_ID_HEADER, "")
    request_id = incoming_id if _VALID_REQUEST_ID.match(incoming_id) else uuid.uuid4().hex
    token = request_id_var.set(request_id)
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        # Full traceback goes to our logs only; the client gets a generic message.
        logger.exception("unhandled error", extra={"method": request.method, "path": request.url.path})
        response = error_response(500, "INTERNAL_ERROR", "An unexpected error occurred")

    latency_ms = round((time.perf_counter() - started) * 1000, 2)
    response.headers[REQUEST_ID_HEADER] = request_id
    # Docker probes /api/health every few seconds; logging each passing probe at INFO would bury real traffic
    # (~17,000 lines a day per container). A failing probe is still logged at INFO.
    passing_probe = request.url.path == HEALTH_PATH and response.status_code == 200
    logger.log(
        logging.DEBUG if passing_probe else logging.INFO,
        "request",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "latency_ms": latency_ms,
        },
    )
    request_id_var.reset(token)
    return response
