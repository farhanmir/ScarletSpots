import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo, { NetInfoSubscription } from "@react-native-community/netinfo";
import { fetchBackend, safeJson } from "../api/api-base";
import { getAccessTokenSilently } from "@/providers/AuthProvider";

// ── Types ──────────────────────────────────────────────────────────────────────

export type QueuedActionType =
  | "PARK"
  | "END_PARK"
  | "CONFIRM_DETECTED"
  | "GENERIC_MUTATION";

export interface QueuedParkAction {
  id: string; // UUID generated at queue time
  type: QueuedActionType;
  payload: Record<string, unknown>;
  endpoint?: string; // Required for GENERIC_MUTATION
  method?: string; // Required for GENERIC_MUTATION
  queuedAt: string; // ISO timestamp
  attempts: number; // How many times we tried and failed
}

// ── Storage Key ────────────────────────────────────────────────────────────────

const QUEUE_KEY = "offline_action_queue_v1";

// ── Listeners ──────────────────────────────────────────────────────────────────

type QueueListener = (pendingCount: number) => void;
const listeners: Set<QueueListener> = new Set();

export function addQueueListener(fn: QueueListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyListeners(count: number) {
  listeners.forEach((fn) => {
    try {
      fn(count);
    } catch {
      /* swallow */
    }
  });
}

// ── Network Subscription ───────────────────────────────────────────────────────

let netInfoUnsubscribe: NetInfoSubscription | null = null;
let isFlushing = false;

export function initOfflineQueue(): void {
  if (netInfoUnsubscribe) return;

  netInfoUnsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      flushQueue().catch(() => {
        /* best-effort */
      });
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
  } catch {
    /* swallow */
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function getPendingActions(): Promise<QueuedParkAction[]> {
  return readQueue();
}

export async function getPendingCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

export async function queueParkAction(
  type: QueuedActionType,
  payload: Record<string, unknown>,
  endpoint?: string,
  method?: string,
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

  console.log(
    `[OfflineQueue] Queued ${type} action (id: ${action.id}). Queue depth: ${queue.length}`,
  );
  return action;
}

export async function flushQueue(): Promise<{
  flushed: number;
  failed: number;
}> {
  if (isFlushing) return { flushed: 0, failed: 0 };
  isFlushing = true;
  try {
    const queue = await readQueue();
    if (queue.length === 0) return { flushed: 0, failed: 0 };

    console.log(`[OfflineQueue] Flushing ${queue.length} queued action(s)...`);

    let flushed = 0;
    let failed = 0;
    const remaining: QueuedParkAction[] = [];

    for (const action of queue) {
      if (action.attempts >= 5) {
        console.warn(
          `[OfflineQueue] Dropping action ${action.id} after 5 failed attempts.`,
        );
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
  } finally {
    isFlushing = false;
  }
}

export async function removeQueuedAction(id: string): Promise<void> {
  const queue = await readQueue();
  const updated = queue.filter((a) => a.id !== id);
  await writeQueue(updated);
  notifyListeners(updated.length);
}

export async function clearQueue(): Promise<void> {
  await writeQueue([]);
  notifyListeners(0);
}

// ── Action Dispatcher ──────────────────────────────────────────────────────────

async function dispatchAction(action: QueuedParkAction): Promise<void> {
  const accessToken = await getAccessTokenSilently();
  if (!accessToken) throw new Error("No token available to flush queue");

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  const endpoint =
    action.endpoint ||
    (action.type === "END_PARK" ? "/park/session/end" : "/park/session");

  const response = await fetchBackend(endpoint, {
    method: action.method || "POST",
    headers,
    body: JSON.stringify(action.payload),
  });

  const data = await safeJson(response);
  if (!response.ok) {
    throw new Error(
      data?.error || data?.message || `API error ${response.status}`,
    );
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replaceAll(/[xy]/g, (c) => {
    const r = Math.trunc(Math.random() * 16);
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
