"""
Redis cache bootstrap with graceful degradation.

If Redis is unreachable at startup, the application falls back to an in-memory
Python RAM cache (InMemoryBackend) — no 500 errors, still some performance gain.
"""

import logging

from fastapi_cache import FastAPICache
from fastapi_cache.backends.inmemory import InMemoryBackend
from fastapi_cache.backends.redis import RedisBackend
from redis import asyncio as aioredis

from app.core.config import settings

log = logging.getLogger(__name__)

_redis_pool: aioredis.Redis | None = None


async def init_cache() -> None:
    """Connect to Redis and register the cache backend.

    On failure the warning is logged and caching is silently skipped so the
    application can still serve live data from Supabase.
    """
    global _redis_pool
    try:
        _redis_pool = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
        await _redis_pool.ping()
        FastAPICache.init(RedisBackend(_redis_pool), prefix="scarletspots:")
        log.info("Redis cache connected (%s)", settings.REDIS_URL)
    except Exception as exc:
        log.warning("Redis unavailable — falling back to Python RAM cache: %s", exc)
        _redis_pool = None
        # Give the decorator a fallback engine so it doesn't crash
        FastAPICache.init(InMemoryBackend(), prefix="scarletspots_fallback:")


async def close_cache() -> None:
    """Gracefully shut down the Redis connection pool."""
    if _redis_pool:
        async_close = getattr(_redis_pool, "aclose", None)
        if callable(async_close):
            await async_close()
            return

        close = getattr(_redis_pool, "close", None)
        if callable(close):
            maybe_awaitable = close()
            if hasattr(maybe_awaitable, "__await__"):
                await maybe_awaitable
            else:
                log.info("Redis connection pool closed (sync)")
        else:
            log.warning("Redis pool has no close/aclose method — skipping cleanup")
