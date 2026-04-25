import type * as Location from "expo-location";
import {
  getStatus,
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
  let sensingStarted = false;

  try {
    // Start the native sensing engine (Swift CMMotionActivityManager + AVAudioSession observers)
    startSensing();
    sensingStarted = true;
  } catch (error) {
    BackgroundLogger.error("[NativeMagic] startSensing failed at startup", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // JS only reads status for debug/telemetry; native owns sensing logic.
  void getStatus()
    .then((status) => {
      BackgroundLogger.info("[NativeMagic] Startup status", status);
    })
    .catch((error) => {
      BackgroundLogger.warn("[NativeMagic] Failed to read startup status", {
        error: error instanceof Error ? error.message : String(error),
      });
    });

  try {
    ensureAutoParkDiagnosticsStream();
    void bootstrapAutoParkDiagnostics();
  } catch (error) {
    BackgroundLogger.error("[NativeMagic] Diagnostics bootstrap failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Return cleanup so callers (e.g. useEffect) can teardown properly
  return () => {
    if (sensingStarted) {
      try {
        stopSensing();
      } catch (error) {
        BackgroundLogger.warn("[NativeMagic] stopSensing failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };
}

// Compatibility shims retained so confirmation UI paths remain stable while
// orchestration logic is migrated fully to native.
export async function runParkingDetectionFromLocation(
  _location: Location.LocationObject,
): Promise<ParkingCandidate[]> {
  return [];
}

export async function getPendingParkingCandidates(): Promise<ParkingCandidate[]> {
  return [];
}

export async function clearPendingParkingCandidates(): Promise<void> {
  // no-op
}

export const PARKING_DETECTION_TASK = "PARKING_DETECTION_TASK";
export const LOCATION_TRACKING_TASK = "LOCATION_TRACKING_TASK";
