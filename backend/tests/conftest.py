"""Test setup: a separate `<db>_test` PostgreSQL database (migrated with Alembic) and a separate Redis DB index."""

import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import Session

from app.core.config import Settings

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _test_database_url() -> URL:
    url = make_url(Settings().database_url)
    return url.set(database=f"{url.database}_test")


def _test_redis_url() -> str:
    """Same Redis server, logical database 15, so tests never touch (or flush) the dev data in database 0.
    Assumes REDIS_URL ends in /<db-number>, as in .env.example."""
    base, _, _ = Settings().redis_url.rpartition("/")
    return f"{base}/{TEST_REDIS_DB}"


TEST_REDIS_DB = 15
TEST_DATABASE_URL = _test_database_url()
# Must happen before any app module is imported: app.db and app.core.redis build their clients at import time.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL.render_as_string(hide_password=False)
os.environ["REDIS_URL"] = _test_redis_url()

from fastapi.testclient import TestClient  # noqa: E402
from redis import RedisError  # noqa: E402

from app.core.redis import redis_client  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.db import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base, Role, User  # noqa: E402
from app.services.auth_service import register_user  # noqa: E402

CUSTOMER_PASSWORD = "customer-pass-123"
ADMIN_PASSWORD = "admin-pass-123"


def _redis_is_reachable() -> bool:
    try:
        return bool(redis_client.ping())
    except RedisError:
        return False


# Tests that need a live Redis are skipped (and listed with this reason in the summary) when it isn't running.
requires_redis = pytest.mark.skipif(not _redis_is_reachable(), reason="Redis is not reachable at REDIS_URL")


def alembic_config() -> Config:
    return Config(str(BACKEND_DIR / "alembic.ini"))


def _create_test_database_if_missing() -> None:
    admin_engine = create_engine(TEST_DATABASE_URL.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": TEST_DATABASE_URL.database}
        ).scalar()
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{TEST_DATABASE_URL.database}"'))
    admin_engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def _migrated_database() -> None:
    """Build the schema by running the real migrations, so every test run also tests them."""
    _create_test_database_if_missing()
    command.upgrade(alembic_config(), "head")


@pytest.fixture(autouse=True)
def _clean_tables() -> Iterator[None]:
    yield
    table_names = ", ".join(table.name for table in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {table_names} RESTART IDENTITY CASCADE"))


@pytest.fixture(autouse=True)
def _clean_redis() -> Iterator[None]:
    """Rate-limit counters must not leak from one test into the next."""
    yield
    try:
        redis_client.flushdb()  # only the test DB index (see _test_redis_url)
    except RedisError:
        pass  # Redis not running: nothing to clean, and Redis-dependent tests are skipped anyway


@pytest.fixture
def db() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


def auth_headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


@pytest.fixture
def customer(db: Session) -> User:
    return register_user(db, "customer@example.com", CUSTOMER_PASSWORD)


@pytest.fixture
def admin(db: Session) -> User:
    return register_user(db, "admin@example.com", ADMIN_PASSWORD, role=Role.ADMIN)


@pytest.fixture
def customer_headers(customer: User) -> dict[str, str]:
    return auth_headers(customer)


@pytest.fixture
def admin_headers(admin: User) -> dict[str, str]:
    return auth_headers(admin)
