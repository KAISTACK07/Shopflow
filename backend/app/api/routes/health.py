"""GET /api/health — reports whether the database and Redis are reachable."""

import logging
from typing import Literal

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from redis import RedisError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.redis import redis_client
from app.db import get_db

logger = logging.getLogger(__name__)
router = APIRouter(tags=["health"])

CheckStatus = Literal["ok", "down"]


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded", "unavailable"]
    checks: dict[str, CheckStatus]


def _check_database(db: Session) -> CheckStatus:
    try:
        db.execute(text("SELECT 1"))
        return "ok"
    except SQLAlchemyError:
        logger.warning("health check: database unreachable", exc_info=True)
        return "down"


def _check_redis() -> CheckStatus:
    try:
        redis_client.ping()
        return "ok"
    except RedisError:
        logger.warning("health check: redis unreachable", exc_info=True)
        return "down"


@router.get("/health", response_model=HealthResponse)
def health(response: Response, db: Session = Depends(get_db)) -> HealthResponse:
    checks = {"database": _check_database(db), "redis": _check_redis()}

    if checks["database"] == "down":
        # Without the database nothing works: tell load balancers to stop sending traffic.
        response.status_code = 503
        status = "unavailable"
    elif checks["redis"] == "down":
        # Redis only powers rate limiting, which fails open, so the API still serves requests.
        status = "degraded"
    else:
        status = "ok"
    return HealthResponse(status=status, checks=checks)
