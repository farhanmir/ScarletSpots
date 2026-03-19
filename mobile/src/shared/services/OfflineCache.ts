/**
 * OfflineCache — Caching for active parking session state.
 *
 * Lot data is now bundled in the app (no caching needed for lots).
 * Only the active session is cached so the app can restore it after
 * backgrounding or a crash without a network round-trip.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

const SESSION_KEY = "offline_cache_session";
const FAVORITES_KEY = "favorites_cache";
const ANONYMOUS_OWNER = "anon";

let activeOwnerId: string | null = null;

function normalizeOwnerId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function scopedKey(baseKey: string, ownerId?: string | null): string {
  const resolved = normalizeOwnerId(ownerId ?? activeOwnerId) ?? ANONYMOUS_OWNER;
  return `${baseKey}:${resolved}`;
}

export function setOfflineCacheOwner(ownerId: string | null): void {
  activeOwnerId = normalizeOwnerId(ownerId);
}

/** Session cache entries older than 5 minutes are considered stale. */
const STALE_THRESHOLD_MS = 1000 * 60 * 5;

interface CacheEntry<T> {
  data: T;
  cachedAt: string;
}

async function setCache<T>(
  key: string,
  data: T,
  ownerId?: string | null,
): Promise<void> {
  try {
    const entry: CacheEntry<T> = { data, cachedAt: new Date().toISOString() };
    await AsyncStorage.setItem(scopedKey(key, ownerId), JSON.stringify(entry));
  } catch {
    // Swallow — caching must never crash the app
  }
}

async function getCache<T>(
  key: string,
  ownerId?: string | null,
): Promise<{ data: T; isStale: boolean } | null> {
  try {
    const raw = await AsyncStorage.getItem(scopedKey(key, ownerId));
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    const age = Date.now() - new Date(entry.cachedAt).getTime();
    return { data: entry.data, isStale: age > STALE_THRESHOLD_MS };
  } catch {
    return null;
  }
}

// ── Session Cache ──────────────────────────────────────────────────────────

export async function cacheSession(
  session: unknown,
  ownerId?: string | null,
): Promise<void> {
  await setCache(SESSION_KEY, session, ownerId);
}

export async function getCachedSession(ownerId?: string | null): Promise<unknown> {
  const result = await getCache<unknown>(SESSION_KEY, ownerId);
  return result?.data ?? null;
}

export async function clearCachedSession(ownerId?: string | null): Promise<void> {
  await AsyncStorage.removeItem(scopedKey(SESSION_KEY, ownerId));
}

export async function clearCachedFavorites(ownerId?: string | null): Promise<void> {
  await AsyncStorage.removeItem(scopedKey(FAVORITES_KEY, ownerId));
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
  ownerId?: string | null,
): Promise<{ data: T; fromCache: boolean; isStale: boolean }> {
  const netState = await NetInfo.fetch();
  const scopedCacheKey = scopedKey(cacheKey, ownerId);
  const cached = await getCache<T>(cacheKey, ownerId);

  if (netState.isConnected && cached && staleThresholdMs) {
    const raw = await AsyncStorage.getItem(scopedCacheKey);
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
      await setCache(cacheKey, data, ownerId);
      return { data, fromCache: false, isStale: false };
    } catch {
      // Network error — fall through to cache
    }
  }

  if (cached) {
    return { data: cached.data, fromCache: true, isStale: cached.isStale };
  }

  throw new Error("No data available (offline and no cache)");
}

// ── Favorites Cache ───────────────────────────────────────────────────────

export async function cacheFavorites(
  ids: string[],
  ownerId?: string | null,
): Promise<void> {
  await setCache(FAVORITES_KEY, ids, ownerId);
}

export async function getCachedFavorites(
  ownerId?: string | null,
): Promise<string[] | null> {
  const result = await getCache<string[]>(FAVORITES_KEY, ownerId);
  return result?.data ?? null;
}
