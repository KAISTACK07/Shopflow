"""Alembic entry point: runs migrations against DATABASE_URL using our models' metadata."""

from alembic import context
from sqlalchemy import create_engine

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
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    raise SystemExit("Offline (--sql) mode is not supported; run migrations against a database.")
run_migrations_online()
