"""Application settings, read from environment variables (and the repo-root .env in local dev)."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/core/config.py -> parents[3] is the repository root.
REPO_ROOT_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"
EXAMPLE_SECRET_PREFIX = "replace-with"  # the placeholder used in .env.example
JWT_SECRET_MIN_LENGTH = 32  # HS256 key should be at least 256 bits of randomness


class Settings(BaseSettings):
    # Real environment variables win over the .env file; a missing .env file is fine (e.g. in Docker).
    # hide_input_in_errors: a bad value (a too-short JWT secret, a DATABASE_URL with a password) must not be
    # printed into startup logs by Pydantic's validation error message.
    model_config = SettingsConfigDict(env_file=REPO_ROOT_ENV_FILE, extra="ignore", hide_input_in_errors=True)

    app_name: str = "ShopFlow API"
    log_level: str = "INFO"

    database_url: str
    db_pool_size: int = 10
    db_max_overflow: int = 10
    db_connect_timeout_seconds: int = 3

    redis_url: str
    # Short on purpose: a healthy Redis answers in well under 1 ms, and when it is down we fail open
    # (phase 10), so every request would otherwise wait this long.
    redis_timeout_seconds: float = 0.5

    # Per-user checkout rate limit (fixed window in Redis). Counts every POST /api/orders attempt, retries included.
    checkout_rate_limit: int = Field(default=10, gt=0)
    checkout_rate_limit_window_seconds: int = Field(default=60, gt=0)

    # SecretStr: never shows up in logs, reprs or tracebacks by accident.
    jwt_secret: SecretStr = Field(min_length=JWT_SECRET_MIN_LENGTH)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(default=30, gt=0)

    # Demo data for `python -m app.seed`. The admin account is only created when a real password is set;
    # the seed checks it (not a validator here), so a missing demo password never stops the API from starting.
    seed_admin_email: str = "admin@example.com"
    seed_admin_password: SecretStr | None = None

    @field_validator("jwt_secret")
    @classmethod
    def _reject_example_secret(cls, value: SecretStr) -> SecretStr:
        if value.get_secret_value().startswith(EXAMPLE_SECRET_PREFIX):
            raise ValueError("JWT_SECRET still has the placeholder value from .env.example; generate a real one")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
