import type * as Location from "expo-location";
import {
  addParkingListener,
  startSensing,
  stopSensing,
} from "../../../modules/parking-magic";
import type { ParkingCandidate } from "./ParkingDetectionService";
import {
  bootstrapAutoParkDiagnostics,
  ensureAutoParkDiagnosticsStream,
} from "./autoParkDiagnostics";
import { BackgroundLogger } from "@/shared/utils/Logger";

/**
 * 🧹 Phase 6: Legacy Polling Tasks Purged
 * The native ParkingMagic module now handles all background sensing hardware-layer triggers.
 * initBackgroundListeners() MUST be called early in the app lifecycle to activate the Swift
 * sensing engine. It returns a cleanup function that should be called on unmount.
 */
export function initBackgroundListeners(): () => void {
  // Start the native sensing engine (Swift CMMotionActivityManager + AVAudioSession observers)
  startSensing();
  ensureAutoParkDiagnosticsStream();
  void bootstrapAutoParkDiagnostics();

  const subscription = addParkingListener(async (event) => {
    console.log("[NativeMagic] Parking signal received:", event.source, event.lotId);
    BackgroundLogger.info("[NativeMagic] Parking signal received", {
      source: event.source,
      lotId: event.lotId ?? null,
      timestamp: event.timestamp,
    });
    // React to native events when the app is in the foreground
    // Background events are handled directly by the Swift NetworkManager
  });

  // Return cleanup so callers (e.g. useEffect) can teardown properly
  return () => {
    subscription.remove();
    stopSensing();
  };
}

// Compatibility-only shims to isolate removed JS detection path.
// Native Swift controls actual auto-start decisions now.
export async function runParkingDetectionFromLocation(
  _location: Location.LocationObject,
): Promise<ParkingCandidate[]> {
  BackgroundLogger.info(
    "[BackgroundTask] Ignored JS detection call: native diagnostics path is authoritative.",
  );
  return [];
}

export async function getPendingParkingCandidates(): Promise<ParkingCandidate[]> {
  return [];
}

export async function clearPendingParkingCandidates(): Promise<void> {
  // no-op: retained for compatibility with existing screens
}

// Legacy constants kept for any remaining import sites during migration
export const PARKING_DETECTION_TASK = "PARKING_DETECTION_TASK";
export const LOCATION_TRACKING_TASK = "LOCATION_TRACKING_TASK";
