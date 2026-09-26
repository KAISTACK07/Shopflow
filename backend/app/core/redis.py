"""Shared Redis client. Connects lazily, so the app still starts when Redis is down."""

from redis import Redis

from app.core.config import get_settings

settings = get_settings()

redis_client = Redis.from_url(
    settings.redis_url,
    socket_timeout=settings.redis_timeout_seconds,
    socket_connect_timeout=settings.redis_timeout_seconds,
    decode_responses=True,
)
