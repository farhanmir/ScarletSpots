import AsyncStorage from "@react-native-async-storage/async-storage";

const CRASH_LOG_KEY = "crash_logs";
const MAX_LOGS = 50;

export interface CrashLogEntry {
  timestamp: string;
  message: string;
  stack?: string;
  screen?: string;
  extra?: Record<string, unknown>;
}

/**
 * Append a crash/error entry to the persistent log.
 */
export async function logCrash(
  entry: Omit<CrashLogEntry, "timestamp">,
): Promise<void> {
  try {
    const existing = await getCrashLogs();
    existing.push({ ...entry, timestamp: new Date().toISOString() });
    // Keep only the most recent entries
    const trimmed = existing.slice(-MAX_LOGS);
    await AsyncStorage.setItem(CRASH_LOG_KEY, JSON.stringify(trimmed));
  } catch {
    // Swallow — logging should never crash the app
  }
}

/**
 * Retrieve all saved crash logs.
 */
export async function getCrashLogs(): Promise<CrashLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(CRASH_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Clear all crash logs.
 */
export async function clearCrashLogs(): Promise<void> {
  await AsyncStorage.removeItem(CRASH_LOG_KEY);
}

/**
 * Install global error handlers that persist crash info.
 * Call this once at app startup (e.g. in _layout.tsx).
 */
export function installGlobalCrashHandlers(): void {
  // 1. Unhandled JS exceptions (React Native global handler)
  const defaultHandler = (ErrorUtils as any).getGlobalHandler?.();
  (ErrorUtils as any).setGlobalHandler?.((error: Error, isFatal?: boolean) => {
    logCrash({
      message: `[${isFatal ? "FATAL" : "ERROR"}] ${error.message}`,
      stack: error.stack,
    });
    // Still call the default handler so RN can show the red-box in dev
    if (defaultHandler) {
      defaultHandler(error, isFatal);
    }
  });

  // 2. Unhandled promise rejections
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rejectionTracking = require("promise/setimmediate/rejection-tracking");
  rejectionTracking.enable({
    allRejections: true,
    onUnhandled: (_id: number, error: any) => {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      logCrash({ message: `[PROMISE] ${message}`, stack });
    },
    onHandled: () => {},
  });
}
