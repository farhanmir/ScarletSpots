import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AutoParkSignalSnapshot } from "./ParkingDetectionService";

export const AUTOPARK_LAST_TRACE_KEY = "ss_autopark_last_trace";

export type AutoParkBranch =
  | "no_lots_data"
  | "no_candidates"
  | "below_threshold"
  | "auto_confirm_ok"
  | "notification_scheduled";

export interface AutoParkLastTrace {
  savedAt: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  budgetRemainingMs: number;
  branch: AutoParkBranch;
  reasonCode: string;
  confidenceThreshold: number;
  snapshot: AutoParkSignalSnapshot;
  topCandidate?: {
    lotId: string;
    lotName: string;
    confidence: number;
    autoConfirmable: boolean;
  };
}

export async function persistAutoParkLastTrace(
  trace: AutoParkLastTrace,
): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTOPARK_LAST_TRACE_KEY, JSON.stringify(trace));
  } catch {
    /* best-effort */
  }
}

export async function loadAutoParkLastTrace(): Promise<AutoParkLastTrace | null> {
  try {
    const raw = await AsyncStorage.getItem(AUTOPARK_LAST_TRACE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AutoParkLastTrace;
    if (!parsed || typeof parsed.branch !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function formatAutoParkTraceForDisplay(t: AutoParkLastTrace): string {
  const lines = [
    `Saved: ${t.savedAt}`,
    `Branch: ${t.branch} (${t.reasonCode})`,
    `Position: ${t.latitude.toFixed(5)}, ${t.longitude.toFixed(5)}`,
    `GPS accuracy (m): ${t.accuracy ?? "n/a"} | Speed (m/s): ${t.speed ?? "n/a"}`,
    `Budget remaining (ms): ${t.budgetRemainingMs}`,
    `Confidence threshold: ${t.confidenceThreshold}`,
    "",
    "Signals:",
    `  speedTransition: ${t.snapshot.speedTransition}`,
    `  transit veto: ${t.snapshot.transitPatternDetected}`,
    `  recentDrivingPersisted: ${t.snapshot.recentDrivingPersisted}`,
    `  stillness: ${t.snapshot.stillness}`,
    `  headingChange: ${t.snapshot.headingChange}`,
    `  gpsAccuracy: ${t.snapshot.gpsAccuracy}`,
    `  pedometerSignal: ${t.snapshot.pedometerSignal}`,
    `  activityBoost: ${t.snapshot.activityBoost}`,
    `  inside lot: ${t.snapshot.insideLotName ?? t.snapshot.insideLotId ?? "none"}`,
  ];
  if (t.topCandidate) {
    lines.push(
      "",
      "Top candidate:",
      `  ${t.topCandidate.lotName} (${t.topCandidate.lotId})`,
      `  confidence: ${t.topCandidate.confidence.toFixed(3)}`,
      `  autoConfirmable: ${t.topCandidate.autoConfirmable}`,
    );
  }
  return lines.join("\n");
}
