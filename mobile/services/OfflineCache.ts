/**
 * OfflineCache — Caching for active parking session state.
 *
 * Lot data is now bundled in the app (no caching needed for lots).
 * Only the active session is cached so the app can restore it after
 * backgrounding or a crash without a network round-trip.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const SESSION_KEY = 'offline_cache_session';

/** Session cache entries older than 5 minutes are considered stale. */
const STALE_THRESHOLD_MS = 1000 * 60 * 5;

interface CacheEntry<T> {
  data: T;
  cachedAt: string;
}

async function setCache<T>(key: string, data: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = { data, cachedAt: new Date().toISOString() };
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Swallow — caching must never crash the app
  }
}

async function getCache<T>(key: string): Promise<{ data: T; isStale: boolean } | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    const age = Date.now() - new Date(entry.cachedAt).getTime();
    return { data: entry.data, isStale: age > STALE_THRESHOLD_MS };
  } catch {
    return null;
  }
}

// ── Session Cache ──────────────────────────────────────────────────────────

export async function cacheSession(session: unknown): Promise<void> {
  await setCache(SESSION_KEY, session);
}

export async function getCachedSession(): Promise<unknown> {
  const result = await getCache<unknown>(SESSION_KEY);
  return result?.data ?? null;
}

export async function clearCachedSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}

// ── Network-Aware Fetch with Fallback ──────────────────────────────────────

/**
 * Wraps an async fetch with a cached fallback.
 * Used for session state so the app can show the last-known session
 * even when the backend is unreachable.
 */
export async function fetchWithOfflineFallback<T>(
  fetchFn: () => Promise<T>,
  cacheKey: string,
  staleThresholdMs?: number,
): Promise<{ data: T; fromCache: boolean; isStale: boolean }> {
  const netState = await NetInfo.fetch();
  const cached = await getCache<T>(cacheKey);

  if (netState.isConnected && cached && staleThresholdMs) {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (raw) {
      const entry: CacheEntry<T> = JSON.parse(raw);
      const age = Date.now() - new Date(entry.cachedAt).getTime();
      if (age < staleThresholdMs) {
        return { data: cached.data, fromCache: true, isStale: false };
      }
    }
  }

  if (netState.isConnected) {
    try {
      const data = await fetchFn();
      await setCache(cacheKey, data);
      return { data, fromCache: false, isStale: false };
    } catch {
      // Network error — fall through to cache
    }
  }

  if (cached) {
    return { data: cached.data, fromCache: true, isStale: cached.isStale };
  }

  throw new Error('No data available (offline and no cache)');
}
