/**
 * OfflineCache — Local caching for lot data and geofence polygons.
 *
 * Provides fallback data when the network is unreachable, with automatic
 * cache refresh when online and data is stale (>1 hour).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { LOT_CACHE_TTL_MS } from '../constants/featureFlags';

const CACHE_KEYS = {
  lots: 'offline_cache_lots',
  session: 'offline_cache_session',
  timestamp: 'offline_cache_timestamp',
};

/** Cache entries older than this are considered stale (from feature flag, default 1 h). */
const STALE_THRESHOLD_MS = LOT_CACHE_TTL_MS;

interface CacheEntry<T> {
  data: T;
  cachedAt: string;
}

// ── Generic Cache Helpers ──────────────────────────────────────────────────────

async function setCache<T>(key: string, data: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = {
      data,
      cachedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Swallow — caching should never crash the app
  }
}

async function getCache<T>(key: string): Promise<{ data: T; isStale: boolean; cachedAt: string } | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;

    const entry: CacheEntry<T> = JSON.parse(raw);
    const age = Date.now() - new Date(entry.cachedAt).getTime();
    return {
      data: entry.data,
      isStale: age > STALE_THRESHOLD_MS,
      cachedAt: entry.cachedAt,
    };
  } catch {
    return null;
  }
}

// ── Lot Cache ──────────────────────────────────────────────────────────────────

export async function cacheLots(lots: any[]): Promise<void> {
  await setCache(CACHE_KEYS.lots, lots);
}

export async function getCachedLots(): Promise<{ lots: any[]; isStale: boolean } | null> {
  const result = await getCache<any[]>(CACHE_KEYS.lots);
  if (!result) return null;
  return { lots: result.data, isStale: result.isStale };
}

// ── Session Cache ──────────────────────────────────────────────────────────────

export async function cacheSession(session: any): Promise<void> {
  await setCache(CACHE_KEYS.session, session);
}

export async function getCachedSession(): Promise<unknown> {
  const result = await getCache<any>(CACHE_KEYS.session);
  return result?.data ?? null;
}

export async function clearCachedSession(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEYS.session);
}

// ── Network-Aware Fetch with Fallback ──────────────────────────────────────────

/**
 * Attempt to fetch data from the network. If offline, return cached data.
 * If online, fetch fresh data and update the cache.
 */
export async function fetchWithOfflineFallback<T>(
  fetchFn: () => Promise<T>,
  cacheKey: string,
  staleThresholdMs?: number,
): Promise<{ data: T; fromCache: boolean; isStale: boolean }> {
  const netState = await NetInfo.fetch();
  const cached = await getCache<T>(cacheKey);

  // If we have a fresh cache and are online, skip the network call to save bandwidth
  if (netState.isConnected && cached && staleThresholdMs) {
    const age = Date.now() - new Date(cached.cachedAt).getTime();
    if (age < staleThresholdMs) {
      console.log(`[Cache] Using fresh cache for ${cacheKey} (age: ${Math.round(age/1000)}s)`);
      return { data: cached.data, fromCache: true, isStale: false };
    }
  }

  if (netState.isConnected) {
    try {
      const data = await fetchFn();
      await setCache(cacheKey, data);
      return { data, fromCache: false, isStale: false };
    } catch {
      // Network error despite being "connected" — fall through to cache
    }
  }

  // Offline or fetch failed — return the cache we already read at the top
  if (cached) {
    return { data: cached.data, fromCache: true, isStale: cached.isStale };
  }

  // No cache available — throw
  throw new Error('No data available (offline and no cache)');
}
