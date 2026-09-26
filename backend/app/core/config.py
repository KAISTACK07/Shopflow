"""Application settings, read from environment variables (and the repo-root .env in local dev)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/core/config.py -> parents[3] is the repository root.
REPO_ROOT_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    # Real environment variables win over the .env file; a missing .env file is fine (e.g. in Docker).
    model_config = SettingsConfigDict(env_file=REPO_ROOT_ENV_FILE, extra="ignore")

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
