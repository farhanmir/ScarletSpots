"""
Redis cache bootstrap with graceful degradation.

If Redis is unreachable at startup the application continues without caching —
all @cache-decorated endpoints simply fall through to the original function.
"""

import logging

from redis import asyncio as aioredis

from fastapi_cache import FastAPICache
from fastapi_cache.backends.redis import RedisBackend

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
        log.warning("Redis unavailable — caching disabled: %s", exc)
        _redis_pool = None


async def close_cache() -> None:
    """Gracefully shut down the Redis connection pool."""
    if _redis_pool:
        await _redis_pool.aclose()
