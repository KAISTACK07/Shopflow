"""Shared FastAPI dependencies: DB session, current user, admin guard."""

import logging
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis import RedisError
from sqlalchemy.orm import Session

from app.core.errors import ForbiddenError, RateLimitedError, UnauthorizedError
from app.core.rate_limit import checkout_limiter
from app.core.security import decode_access_token
from app.db import get_db
from app.models import Role, User

logger = logging.getLogger(__name__)

DbSession = Annotated[Session, Depends(get_db)]

# auto_error=False: we raise our own 401 so it uses the standard error envelope.
_bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
) -> User:
    if credentials is None:
        raise UnauthorizedError("Missing bearer token")

    user_id = decode_access_token(credentials.credentials)
    # Load the user on every request: a deleted user's token stops working, and a role change applies
    # immediately instead of when the token expires.
    user = db.get(User, user_id) if user_id is not None else None
    if user is None:
        raise UnauthorizedError("Invalid or expired token")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_optional_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
) -> User | None:
    """For public endpoints that show admins more. No token → anonymous; a *bad* token is still a 401,
    so a client with an expired token finds out instead of silently seeing the public view."""
    if credentials is None:
        return None
    return get_current_user(db, credentials)


OptionalUser = Annotated[User | None, Depends(get_optional_user)]


def enforce_checkout_rate_limit(user: CurrentUser) -> None:
    """429 when the user has used up this window's checkout attempts.

    Fails OPEN: if Redis is down we let the request through and log a warning. Rate limiting protects
    capacity, not correctness (row locks already prevent overselling), so a Redis outage shouldn't turn into
    a checkout outage.
    """
    try:
        decision = checkout_limiter.hit(str(user.id))
    except RedisError:
        logger.warning("rate limiter unavailable, allowing request (fail open)", extra={"user_id": user.id})
        return
    if not decision.allowed:
        raise RateLimitedError(
            f"Too many checkout attempts; try again in {decision.retry_after_seconds} seconds",
            details={"limit": decision.limit, "retry_after_seconds": decision.retry_after_seconds},
            headers={"Retry-After": str(decision.retry_after_seconds)},
        )


def require_admin(user: CurrentUser) -> User:
    if user.role != Role.ADMIN:
        raise ForbiddenError("Admin access required")
    return user


AdminUser = Annotated[User, Depends(require_admin)]
