"""Registration and login rules."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, UnauthorizedError
from app.core.security import DUMMY_PASSWORD_HASH, hash_password, password_needs_rehash, verify_password
from app.db import violated_constraint
from app.models import Role, User


class EmailAlreadyRegisteredError(ConflictError):
    code = "EMAIL_ALREADY_REGISTERED"


class InvalidCredentialsError(UnauthorizedError):
    code = "INVALID_CREDENTIALS"


def register_user(db: Session, email: str, password: str, role: Role = Role.CUSTOMER) -> User:
    """Create a user. The public endpoint always uses the default role; only the seed script passes ADMIN."""
    user = User(email=email.lower(), password_hash=hash_password(password), role=role)
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        # No "does this email exist?" query first: two concurrent sign-ups could both pass it.
        # The unique constraint decides, and we translate its error.
        db.rollback()
        if violated_constraint(exc) == "uq_users_email":
            raise EmailAlreadyRegisteredError("An account with this email already exists") from exc
        raise
    return user


def authenticate(db: Session, email: str, password: str) -> User:
    user = db.scalar(select(User).where(User.email == email.lower()))
    if user is None:
        # Still do the (slow) hash check so "unknown email" and "wrong password" take the same time;
        # otherwise response timing reveals which emails have accounts.
        verify_password(DUMMY_PASSWORD_HASH, password)
        raise InvalidCredentialsError("Invalid email or password")

    if not verify_password(user.password_hash, password):
        raise InvalidCredentialsError("Invalid email or password")

    if password_needs_rehash(user.password_hash):
        # We only ever see the plain password at login, so this is the moment to upgrade old hashes.
        user.password_hash = hash_password(password)
        db.commit()
    return user
