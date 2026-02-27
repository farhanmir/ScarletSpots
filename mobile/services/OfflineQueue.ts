/**
 * OfflineQueue — Persistent action queue for offline-first parking operations.
 *
 * Problem: Parking garages often have no cell service. A user should be able to
 * tap "Park" underground and have the app automatically sync the session to the
 * server as soon as they step back into WiFi / 5G range.
 *
 * Design:
 *  - Actions are serialized to AsyncStorage so they survive app restarts.
 *  - A network-state listener is registered once (via `initOfflineQueue`) and
 *    triggers a flush whenever the device comes back online.
 *  - `flushQueue` is idempotent: it retries each action exactly once per call,
 *    and only removes items that succeed. Failed items stay for the next flush.
 *  - The parent screen can subscribe via `addQueueListener` to update its UI
 *    (e.g. show "1 action pending sync" banner).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoSubscription } from '@react-native-community/netinfo';
import { fetchBackend, safeJson } from '../lib/api-base';
import { supabase } from '../lib/supabase-client';

// ── Types ──────────────────────────────────────────────────────────────────────

export type QueuedActionType = 'PARK' | 'END_PARK' | 'CONFIRM_DETECTED' | 'GENERIC_MUTATION';

export interface QueuedParkAction {
  id: string;           // UUID generated at queue time
  type: QueuedActionType;
  payload: Record<string, unknown>;
  endpoint?: string;    // Required for GENERIC_MUTATION
  method?: string;      // Required for GENERIC_MUTATION
  queuedAt: string;     // ISO timestamp
  attempts: number;     // How many times we tried and failed
}

// ── Storage Key ────────────────────────────────────────────────────────────────

const QUEUE_KEY = 'offline_action_queue_v1';

// ── Listeners ──────────────────────────────────────────────────────────────────

type QueueListener = (pendingCount: number) => void;
const listeners: Set<QueueListener> = new Set();

export function addQueueListener(fn: QueueListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyListeners(count: number) {
  listeners.forEach(fn => {
    try { fn(count); } catch { /* swallow */ }
  });
}

// ── Network Subscription ───────────────────────────────────────────────────────

let netInfoUnsubscribe: NetInfoSubscription | null = null;

/**
 * Call once (e.g. in app _layout or AuthProvider) to register the
 * network-state listener that auto-flushes the queue when coming online.
 *
 * Safe to call multiple times — only one subscription is kept.
 */
export function initOfflineQueue(): void {
  if (netInfoUnsubscribe) return; // Already initialised

  netInfoUnsubscribe = NetInfo.addEventListener(state => {
    if (state.isConnected && state.isInternetReachable !== false) {
      flushQueue().catch(() => {/* best-effort */});
    }
  });
}

export function teardownOfflineQueue(): void {
  netInfoUnsubscribe?.();
  netInfoUnsubscribe = null;
}

// ── Queue Persistence ──────────────────────────────────────────────────────────

async function readQueue(): Promise<QueuedParkAction[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedParkAction[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch { /* swallow — queue failure should never crash the app */ }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Return all currently queued actions. */
export async function getPendingActions(): Promise<QueuedParkAction[]> {
  return readQueue();
}

/** Return the count of pending actions. */
export async function getPendingCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

/**
 * Add a parking action to the offline queue.
 *
 * @example
 * await queueParkAction('PARK', { lotId, spotNumber, latitude, longitude, confirmed: true });
 */
export async function queueParkAction(
  type: QueuedActionType,
  payload: Record<string, unknown>,
  endpoint?: string,
  method?: string
): Promise<QueuedParkAction> {
  const action: QueuedParkAction = {
    id: generateId(),
    type,
    payload,
    endpoint,
    method,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };

  const queue = await readQueue();
  queue.push(action);
  await writeQueue(queue);
  notifyListeners(queue.length);

  console.log(`[OfflineQueue] Queued ${type} action (id: ${action.id}). Queue depth: ${queue.length}`);
  return action;
}

/**
 * Attempt to flush all queued actions to the server.
 * - Successful actions are removed from the queue.
 * - Failed actions have their `attempts` counter incremented and are kept.
 * - Actions that have failed ≥ 5 times are dropped to avoid stale data.
 */
export async function flushQueue(): Promise<{ flushed: number; failed: number }> {
  const queue = await readQueue();
  if (queue.length === 0) return { flushed: 0, failed: 0 };

  console.log(`[OfflineQueue] Flushing ${queue.length} queued action(s)...`);

  let flushed = 0;
  let failed = 0;
  const remaining: QueuedParkAction[] = [];

  for (const action of queue) {
    // Drop permanently stale actions (too many failures)
    if (action.attempts >= 5) {
      console.warn(`[OfflineQueue] Dropping action ${action.id} after 5 failed attempts.`);
      continue;
    }

    try {
      await dispatchAction(action);
      flushed++;
      console.log(`[OfflineQueue] Flushed ${action.type} (id: ${action.id})`);
    } catch (err) {
      failed++;
      remaining.push({ ...action, attempts: action.attempts + 1 });
      console.warn(`[OfflineQueue] Failed to flush ${action.id}:`, err);
    }
  }

  await writeQueue(remaining);
  notifyListeners(remaining.length);

  return { flushed, failed };
}

/**
 * Remove a specific action from the queue by ID (e.g. user cancelled the pending action).
 */
export async function removeQueuedAction(id: string): Promise<void> {
  const queue = await readQueue();
  const updated = queue.filter(a => a.id !== id);
  await writeQueue(updated);
  notifyListeners(updated.length);
}

/**
 * Clear all queued actions (use with caution — for user-initiated reset only).
 */
export async function clearQueue(): Promise<void> {
  await writeQueue([]);
  notifyListeners(0);
}

// ── Action Dispatcher ──────────────────────────────────────────────────────────

/**
 * Maps a queued action type to the correct API call.
 * Does NOT use authApiCall from supabase.ts (to avoid circular dependency).
 * Implementation follows standard auth pattern with JWT.
 */
async function dispatchAction(action: QueuedParkAction): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No session available to flush queue');

  const headers = {
    'Content-Type': 'application/json',
    'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
    'Authorization': `Bearer ${session.access_token}`,
  };

  const endpoint = action.endpoint || (
    action.type === 'END_PARK' ? '/park/session/end' : '/park/session'
  );
  
  const response = await fetchBackend(endpoint, {
    method: action.method || 'POST',
    headers,
    body: JSON.stringify(action.payload),
  });

  const data = await safeJson(response);
  if (!response.ok) {
    throw new Error(data?.error || data?.message || `API error ${response.status}`);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Simple pseudo-UUID (no crypto dependency needed). */
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replaceAll(/[xy]/g, c => {
    const r = Math.trunc(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
