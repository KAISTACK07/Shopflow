"""Password hashing (argon2id) and JWT access tokens."""

from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.config import get_settings

# argon2-cffi defaults follow RFC 9106's recommended profile; salts are generated and stored in the hash.
_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    """True if the hash was made with older/weaker parameters than the current defaults."""
    return _hasher.check_needs_rehash(password_hash)


# A real hash to verify against when the email doesn't exist, so login takes the same time either way
# (measured locally: ~0.10 s for both known and unknown emails, after the first request warms up the pool).
DUMMY_PASSWORD_HASH = _hasher.hash("timing-equaliser-not-a-real-password")


def create_access_token(user_id: int, expires_in: timedelta | None = None) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    lifetime = expires_in if expires_in is not None else timedelta(minutes=settings.access_token_expire_minutes)
    claims = {"sub": str(user_id), "iat": now, "exp": now + lifetime}
    return jwt.encode(claims, settings.jwt_secret.get_secret_value(), algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> int | None:
    """Return the user id if the token is valid and unexpired, otherwise None."""
    settings = get_settings()
    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            # Pin the algorithm: never let the token's own header choose it (e.g. "none").
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "exp", "iat"]},
        )
        return int(claims["sub"])
    except (jwt.InvalidTokenError, ValueError):
        return None
