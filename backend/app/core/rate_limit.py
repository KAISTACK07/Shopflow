"""Fixed-window rate limiting in Redis.

For each (identifier, window) there is one counter key, e.g. `rl:checkout:42:29640117` (user 42, the 29640117th
60-second window since the epoch). Every request INCRements it; the first INCR also sets an expiry so old
windows clean themselves up. INCR is atomic in Redis, so concurrent requests can't both read "4" and both
think they are request #5.

Trade-off: at a window boundary a client can send `limit` requests at the end of one window and `limit` more
at the start of the next (up to 2x the limit in a short burst). A sliding window avoids that but costs more
(a sorted set per user or two counters with weighting). For protecting checkout, fixed window is enough.
"""

import math
import time
from collections.abc import Callable
from dataclasses import dataclass

from redis import Redis

from app.core.config import get_settings
from app.core.redis import redis_client


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    limit: int
    remaining: int
    retry_after_seconds: int  # until the current window ends


class FixedWindowRateLimiter:
    def __init__(
        self,
        redis: Redis,
        *,
        name: str,
        limit: int,
        window_seconds: int,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.redis = redis
        self.name = name
        self.limit = limit
        self.window_seconds = window_seconds
        self.clock = clock  # injectable, so tests can pin the time

    def hit(self, identifier: str) -> RateLimitDecision:
        """Count one request. Raises redis.RedisError if Redis is unreachable (the caller decides what to do)."""
        now = self.clock()
        window = int(now // self.window_seconds)
        key = f"rl:{self.name}:{identifier}:{window}"

        # MULTI/EXEC: both commands run together. EXPIRE ... NX only sets the TTL when the key has none,
        # i.e. on the first request of the window.
        pipe = self.redis.pipeline(transaction=True)
        pipe.incr(key)
        pipe.expire(key, self.window_seconds, nx=True)
        count, _ = pipe.execute()

        window_end = (window + 1) * self.window_seconds
        return RateLimitDecision(
            allowed=count <= self.limit,
            limit=self.limit,
            remaining=max(0, self.limit - count),
            retry_after_seconds=max(1, math.ceil(window_end - now)),
        )


_settings = get_settings()
checkout_limiter = FixedWindowRateLimiter(
    redis_client,
    name="checkout",
    limit=_settings.checkout_rate_limit,
    window_seconds=_settings.checkout_rate_limit_window_seconds,
)
