"""Shared FastAPI dependencies: DB session, current user, admin guard."""

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.security import decode_access_token
from app.db import get_db
from app.models import Role, User

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


def require_admin(user: CurrentUser) -> User:
    if user.role != Role.ADMIN:
        raise ForbiddenError("Admin access required")
    return user


AdminUser = Annotated[User, Depends(require_admin)]
