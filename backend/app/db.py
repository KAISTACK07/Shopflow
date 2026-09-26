"""Database engine and per-request session."""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_pre_ping=True,  # drop dead connections (e.g. after a DB restart) instead of failing a request
    connect_args={"connect_timeout": settings.db_connect_timeout_seconds},
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request, always closed afterwards."""
    with SessionLocal() as session:
        yield session


def violated_constraint(exc: IntegrityError) -> str | None:
    """Name of the constraint PostgreSQL reported, e.g. "uq_users_email" (psycopg exposes it via `diag`)."""
    diag = getattr(exc.orig, "diag", None)
    return getattr(diag, "constraint_name", None)
