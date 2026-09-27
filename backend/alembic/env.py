"""Alembic entry point: runs migrations against DATABASE_URL using our models' metadata."""

from alembic import context
from sqlalchemy import create_engine, text

from app.constants import MIGRATION_ADVISORY_LOCK_ID
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.models import Base

settings = get_settings()
# Use our JSON logging instead of Alembic's ini-file logging (which would disable the app's loggers).
configure_logging(settings.log_level)


def run_migrations_online() -> None:
    engine = create_engine(settings.database_url)
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=Base.metadata,
            compare_type=True,  # let autogenerate/`alembic check` notice column type changes too
        )
        with context.begin_transaction():
            # Every backend container runs migrations on start. If several start at once they'd race to create
            # the same tables (seen in tests: UniqueViolation on pg_type). This lock makes them take turns: the
            # first migrates; the others wait here, then read the (now current) version and have nothing to do.
            # Transaction-scoped: released automatically on COMMIT or ROLLBACK, even if the process crashes.
            connection.execute(text("SELECT pg_advisory_xact_lock(:id)"), {"id": MIGRATION_ADVISORY_LOCK_ID})
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    raise SystemExit("Offline (--sql) mode is not supported; run migrations against a database.")
run_migrations_online()
