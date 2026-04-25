import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  addAutoParkDiagnosticsListener,
  clearAutoParkDiagnostics,
  getAutoParkDiagnostics,
  type AutoParkLiveSnapshot,
} from "../../../modules/parking-magic";
import { BackgroundLogger } from "@/shared/utils/Logger";

const DIAG_STORAGE_KEY = "ss_autopark_live_diagnostics";
const HISTORY_LIMIT = 80;

type DiagnosticsState = {
  latest: AutoParkLiveSnapshot | null;
  history: AutoParkLiveSnapshot[];
};

type DiagnosticsListener = (state: DiagnosticsState) => void;

let cache: DiagnosticsState = { latest: null, history: [] };
let nativeSub: { remove: () => void } | null = null;
const listeners = new Set<DiagnosticsListener>();

function trim(history: AutoParkLiveSnapshot[]): AutoParkLiveSnapshot[] {
  return history.slice(-HISTORY_LIMIT);
}

function logSnapshot(snapshot: AutoParkLiveSnapshot) {
  const failingChecks = snapshot.checks.filter((c) => !c.passed).map((c) => c.key);
  BackgroundLogger.info("[AutoParkLive] Snapshot", {
    status: snapshot.decisionStatus,
    reason: snapshot.decisionReasonCode,
    source: snapshot.source,
    speedMps: snapshot.speedMps,
    horizontalAccuracy: snapshot.horizontalAccuracy,
    lotId: snapshot.lotId,
    failingChecks,
  });
}

async function persistCache() {
  try {
    await AsyncStorage.setItem(DIAG_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // best effort
  }
}

function publish() {
  for (const listener of listeners) {
    listener(cache);
  }
}

function applySnapshot(snapshot: AutoParkLiveSnapshot) {
  cache = {
    latest: snapshot,
    history: trim([...cache.history, snapshot]),
  };
  logSnapshot(snapshot);
  publish();
  void persistCache();
}

export async function bootstrapAutoParkDiagnostics(): Promise<DiagnosticsState> {
  try {
    const native = await getAutoParkDiagnostics();
    cache = {
      latest: native.latest ?? null,
      history: trim(native.history ?? []),
    };
    await persistCache();
    publish();
    return cache;
  } catch {
    try {
      const raw = await AsyncStorage.getItem(DIAG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DiagnosticsState;
        cache = {
          latest: parsed.latest ?? null,
          history: trim(parsed.history ?? []),
        };
      }
    } catch {
      // ignore
    }
    publish();
    return cache;
  }
}

export function ensureAutoParkDiagnosticsStream() {
  if (nativeSub) return;
  nativeSub = addAutoParkDiagnosticsListener((snapshot) => {
    applySnapshot(snapshot);
  });
}

export function subscribeAutoParkDiagnostics(listener: DiagnosticsListener): () => void {
  listeners.add(listener);
  listener(cache);
  return () => {
    listeners.delete(listener);
  };
}

export function getAutoParkDiagnosticsCache(): DiagnosticsState {
  return cache;
}

export async function clearAutoParkDiagnosticsCache(): Promise<void> {
  cache = { latest: null, history: [] };
  publish();
  await AsyncStorage.removeItem(DIAG_STORAGE_KEY);
  try {
    await clearAutoParkDiagnostics();
  } catch {
    // ignore native clear failures
  }
}

