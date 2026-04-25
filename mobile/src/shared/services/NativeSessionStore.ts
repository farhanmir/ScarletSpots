import {
  addSessionStateListener,
  getSessionState,
  refreshSessionState,
  type NativeParkingSession,
  type NativeSessionStoreState,
} from "../../../modules/parking-magic";

export type SessionStoreState = {
  activeAutoSession: boolean;
  session: NativeParkingSession | null;
  reason?: string;
};

type SessionStoreListener = (state: SessionStoreState) => void;

let cache: SessionStoreState = { activeAutoSession: false, session: null };
let nativeSub: { remove: () => void } | null = null;
const listeners = new Set<SessionStoreListener>();

function publish() {
  for (const listener of listeners) listener(cache);
}

function applyNativeState(state: NativeSessionStoreState) {
  cache = {
    activeAutoSession: !!state.activeAutoSession,
    session: state.session ?? null,
    reason: state.reason,
  };
  publish();
}

function ensureNativeSubscription() {
  if (nativeSub) return;
  nativeSub = addSessionStateListener((state) => {
    applyNativeState(state);
  });
}

export async function bootstrapSessionStore(): Promise<SessionStoreState> {
  ensureNativeSubscription();
  try {
    const state = await getSessionState();
    applyNativeState(state);
  } catch {
    cache = { activeAutoSession: false, session: null };
    publish();
  }
  return cache;
}

export async function refreshSessionStore(): Promise<SessionStoreState> {
  ensureNativeSubscription();
  const state = await refreshSessionState();
  applyNativeState(state);
  return cache;
}

export function subscribeSessionStore(listener: SessionStoreListener): () => void {
  ensureNativeSubscription();
  listeners.add(listener);
  listener(cache);
  return () => {
    listeners.delete(listener);
  };
}

export function getSessionStoreCache(): SessionStoreState {
  return cache;
}
