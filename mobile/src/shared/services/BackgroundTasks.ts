import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { Accelerometer, Pedometer } from "expo-sensors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/shared/api/supabase-client";
import { fetchBackend, safeJson } from "@/shared/api/api-base";
import { getLotsForDetection } from "@/shared/constants/lotDetectionData";
import {
  pushSpeed,
  pushAccel,
  pushHeading,
  pushSteps,
  detectParking,
  clearAllDetectionBuffers,
  isTransitStopGoPattern,
  DRIVING_SPEED_THRESHOLD,
  getDetectionBuffersSnapshot,
  restoreDetectionBuffersSnapshot,
  getAutoParkSignalSnapshot,
  type ParkingCandidate,
  type AutoParkSignalSnapshot,
} from "./ParkingDetectionService";
import { loadActivityBoost, markWalkingActivityNow } from "./activitySignals";
import { getSensorBudgetRemainingMs } from "./autoParkGeofenceKeys";
import {
  persistAutoParkLastTrace,
  type AutoParkBranch,
  type AutoParkLastTrace,
} from "./autoParkTrace";
import { cacheSession } from "./OfflineCache";
import { PARKING_CONFIDENCE_THRESHOLD } from "../constants/featureFlags";
import { BackgroundLogger } from "../utils/Logger";

export const PARKING_DETECTION_TASK = "SCARLETSPOTS_PARKING_DETECTION";
const CANDIDATES_STORAGE_KEY = "parking_candidates";
const RECENT_DRIVING_TS_KEY = "recent_driving_ts";
const RECENT_DRIVING_WINDOW_MS = 1000 * 60 * 20;

async function markRecentDrivingSignal(speed: number | null): Promise<void> {
  if (speed == null || speed < DRIVING_SPEED_THRESHOLD) return;
  try {
    await AsyncStorage.setItem(RECENT_DRIVING_TS_KEY, String(Date.now()));
  } catch {
    // Best-effort only; auto-end has in-memory fallback paths too.
  }
}

export async function wasDrivingRecentlyForAutoEnd(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_DRIVING_TS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts <= RECENT_DRIVING_WINDOW_MS;
  } catch {
    return false;
  }
}

// ── Sensor Tracking Listeners ──────────────────────────────────────────────────

let accelSubscription: { remove: () => void } | null = null;
let pedometerSubscription: { remove: () => void } | null = null;
let lastStepCountForWalking: number | null = null;

/**
 * Tracks consecutive task invocations that produced no parking candidate.
 * After SENSOR_MAX_MISSES consecutive misses we stop sensors proactively to
 * avoid keeping the accelerometer alive for the full 3-minute budget window.
 */
let consecutiveSensorMisses = 0;
const SENSOR_MAX_MISSES = 10;

/** Reset the consecutive-miss counter (call on every successful detection). */
export function resetSensorMissCount(): void {
  consecutiveSensorMisses = 0;
}

/**
 * Speed below which pedometer step increases are treated as genuine walking
 * (not steps taken while on a moving bus / train).
 */
const WALKING_MAX_SPEED_MPS = 2.5;

const startSensorTracking = async (currentSpeed: number | null) => {
  if (
    (await getSensorBudgetRemainingMs()) <= 0 ||
    consecutiveSensorMisses >= SENSOR_MAX_MISSES
  ) {
    return;
  }

  if (!accelSubscription) {
    Accelerometer.setUpdateInterval(1000);
    accelSubscription = Accelerometer.addListener((data) => {
      pushAccel(data);
    });
  }

  if (!pedometerSubscription) {
    const isAvailable = await Pedometer.isAvailableAsync();
    if (isAvailable) {
      pedometerSubscription = Pedometer.watchStepCount((result) => {
        // Only attribute steps to walking when the device is genuinely still /
        // slow — avoids inflating the walking boost for bus/train passengers.
        const speed = currentSpeed ?? 0;
        if (
          lastStepCountForWalking != null &&
          result.steps > lastStepCountForWalking &&
          speed < WALKING_MAX_SPEED_MPS
        ) {
          markWalkingActivityNow().catch(() => {});
        }
        lastStepCountForWalking = result.steps;
        pushSteps(result.steps);
      });
    }
  }
};

export const stopSensorTracking = () => {
  if (accelSubscription) {
    accelSubscription.remove();
    accelSubscription = null;
  }
  if (pedometerSubscription) {
    pedometerSubscription.remove();
    pedometerSubscription = null;
  }
  lastStepCountForWalking = null;
};

/**
 * While driving (speed ≥ threshold), tear sensors down. Only subscribe when GPS
 * reports a valid sub-threshold speed; unknown/invalid speed → location-only.
 */
async function syncSensorTrackingForSpeed(
  speed: number | null,
): Promise<void> {
  const valid = speed != null && speed >= 0;
  if (valid && speed >= DRIVING_SPEED_THRESHOLD) {
    stopSensorTracking();
    return;
  }
  if (valid && speed < DRIVING_SPEED_THRESHOLD) {
    await startSensorTracking(speed);
    return;
  }
  stopSensorTracking();
}

async function maybeStopSensorsAfterFailedAttempt(): Promise<void> {
  consecutiveSensorMisses += 1;
  const budgetExhausted = (await getSensorBudgetRemainingMs()) <= 0;
  const tooManyMisses = consecutiveSensorMisses >= SENSOR_MAX_MISSES;
  if (budgetExhausted || tooManyMisses) {
    stopSensorTracking();
  }
}

/**
 * Stops continuous GPS for parking detection. Safe when updates were never
 * started (e.g. simulator). Does not clear geofence keys — lot exit still
 * runs for auto-end.
 */
export async function stopParkingDetectionLocationUpdatesIfRunning(): Promise<void> {
  try {
    const isTracking = await Location.hasStartedLocationUpdatesAsync(
      PARKING_DETECTION_TASK,
    );
    if (isTracking) {
      await Location.stopLocationUpdatesAsync(PARKING_DETECTION_TASK);
      BackgroundLogger.info(
        "[BackgroundTask] reason=gps_stopped Stopped parking detection location updates (budget exhausted or detection finished).",
      );
    }
  } catch (err) {
    BackgroundLogger.warn(
      "[BackgroundTask] reason=gps_stop_failed stopLocationUpdatesAsync:",
      err,
    );
  }
}

export async function runParkingDetectionFromLocation(
  latestLocation: Location.LocationObject,
): Promise<void> {
  let releaseGpsAfterHighConfidence = false;

  const writeTrace = async (
    branch: AutoParkBranch,
    reasonCode: string,
    lots: ReturnType<typeof getLotsForDetection>,
    detectOpts: {
      recentDrivingPersisted: boolean;
      activityBoost: number;
      transitPatternDetected: boolean;
    },
    snapshotOverride: AutoParkSignalSnapshot | null,
    topCandidate?: AutoParkLastTrace["topCandidate"],
  ) => {
    const snapshot =
      snapshotOverride ??
      getAutoParkSignalSnapshot(
        latestLocation.coords.latitude,
        latestLocation.coords.longitude,
        latestLocation.coords.accuracy,
        lots,
        detectOpts,
      );
    const budgetRemainingMs = await getSensorBudgetRemainingMs();
    await persistAutoParkLastTrace({
      savedAt: new Date().toISOString(),
      latitude: latestLocation.coords.latitude,
      longitude: latestLocation.coords.longitude,
      accuracy: latestLocation.coords.accuracy,
      speed: latestLocation.coords.speed,
      budgetRemainingMs,
      branch,
      reasonCode,
      confidenceThreshold: PARKING_CONFIDENCE_THRESHOLD,
      snapshot,
      topCandidate,
    });
  };

  BackgroundLogger.info(
    `[BackgroundTask] Checking location: lat=${latestLocation.coords.latitude.toFixed(5)}, lon=${latestLocation.coords.longitude.toFixed(5)}, speed=${latestLocation.coords.speed}, accuracy=${latestLocation.coords.accuracy}`,
  );

  try {
    try {
      const rawBuffers = await AsyncStorage.getItem("parking_detection_buffers");
      if (rawBuffers) restoreDetectionBuffersSnapshot(JSON.parse(rawBuffers));
    } catch {}

    const speed = latestLocation.coords.speed;
    const heading = latestLocation.coords.heading;
    const ts = latestLocation.timestamp;

    await syncSensorTrackingForSpeed(speed);

    pushSpeed(speed, ts);
    await markRecentDrivingSignal(speed);
    pushHeading(heading, ts);

    const recentDrivingPersisted = await wasDrivingRecentlyForAutoEnd();
    const activityBoost = await loadActivityBoost();
    const transitPatternDetected = isTransitStopGoPattern();
    const detectOpts = {
      recentDrivingPersisted,
      activityBoost,
      transitPatternDetected,
    };

    const lots = getLotsForDetection();
    if (lots.length === 0) {
      BackgroundLogger.info(
        "[BackgroundTask] reason=no_lots_data No lots returned for detection area.",
      );
      await writeTrace(
        "no_lots_data",
        "no_lots_data",
        lots,
        detectOpts,
        getAutoParkSignalSnapshot(
          latestLocation.coords.latitude,
          latestLocation.coords.longitude,
          latestLocation.coords.accuracy,
          lots,
          detectOpts,
        ),
      );
      try {
        await AsyncStorage.setItem(
          "parking_detection_buffers",
          JSON.stringify(getDetectionBuffersSnapshot()),
        );
      } catch {}
      return;
    }

    const candidates = detectParking(
      latestLocation.coords.latitude,
      latestLocation.coords.longitude,
      latestLocation.coords.accuracy,
      lots,
      detectOpts,
    );

    BackgroundLogger.info(
      `[BackgroundTask] Detection yielded ${candidates.length} candidates.`,
      {
        reason: "detection_tick",
        recentDrivingPersisted,
        activityBoost,
        transitPatternDetected,
        topCandidate: candidates[0]
          ? `${candidates[0].lotName} (${candidates[0].confidence})`
          : "none",
      },
    );

    if (candidates.length === 0) {
      const snap = getAutoParkSignalSnapshot(
        latestLocation.coords.latitude,
        latestLocation.coords.longitude,
        latestLocation.coords.accuracy,
        lots,
        detectOpts,
      );
      const reasonCode =
        snap.speedTransition === 0
          ? "no_candidates_speed_transition_0"
          : "no_candidates_empty";
      BackgroundLogger.info(
        `[BackgroundTask] reason=${reasonCode} speedTransition=${snap.speedTransition}`,
      );
      await writeTrace("no_candidates", reasonCode, lots, detectOpts, snap);
      // Slow crawl while searching for a spot: don't burn the miss budget.
      if (speed != null && speed > 0 && speed < DRIVING_SPEED_THRESHOLD) {
        resetSensorMissCount();
      } else {
        await maybeStopSensorsAfterFailedAttempt();
      }
      try {
        await AsyncStorage.setItem(
          "parking_detection_buffers",
          JSON.stringify(getDetectionBuffersSnapshot()),
        );
      } catch {}
      return;
    }

    const topCandidate = candidates[0];

    if (topCandidate.confidence < PARKING_CONFIDENCE_THRESHOLD) {
      BackgroundLogger.info(
        `[BackgroundTask] reason=below_threshold Top candidate ${topCandidate.lotName} confidence ${topCandidate.confidence} < threshold ${PARKING_CONFIDENCE_THRESHOLD}`,
      );
      await writeTrace(
        "below_threshold",
        "below_confidence_threshold",
        lots,
        detectOpts,
        null,
        {
          lotId: topCandidate.lotId,
          lotName: topCandidate.lotName,
          confidence: topCandidate.confidence,
          autoConfirmable: topCandidate.autoConfirmable,
        },
      );
      await maybeStopSensorsAfterFailedAttempt();
      try {
        await AsyncStorage.setItem(
          "parking_detection_buffers",
          JSON.stringify(getDetectionBuffersSnapshot()),
        );
      } catch {}
      return;
    }

    BackgroundLogger.info(
      `[BackgroundTask] reason=high_confidence High confidence parking at ${topCandidate.lotName} (${topCandidate.confidence}). Halting sensors.`,
    );
    resetSensorMissCount();
    stopSensorTracking();
    clearAllDetectionBuffers();
    try {
      await AsyncStorage.removeItem("parking_detection_buffers");
    } catch {}

    await AsyncStorage.setItem(
      CANDIDATES_STORAGE_KEY,
      JSON.stringify(candidates),
    );

    const topSummary: NonNullable<AutoParkLastTrace["topCandidate"]> = {
      lotId: topCandidate.lotId,
      lotName: topCandidate.lotName,
      confidence: topCandidate.confidence,
      autoConfirmable: topCandidate.autoConfirmable,
    };

    // Only auto-confirm (silent server POST) when the candidate is firmly inside
    // a lot polygon. Nearby-only candidates require explicit user confirmation via
    // the notification → confirm sheet path to prevent false positives.
    if (topCandidate.autoConfirmable) {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.access_token) {
          const response = await fetchBackend("/park/session", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "",
              Authorization: `Bearer ${session.access_token}`,
              "x-user-token": session.access_token,
            },
            body: JSON.stringify({
              lotId: topCandidate.lotId,
              latitude: topCandidate.latitude,
              longitude: topCandidate.longitude,
              confirmed: true,
              autoStarted: true,
            }),
          });

          if (response.ok) {
            const data = await safeJson(response);
            if (data?.session) {
              await cacheSession({ session: data.session });
            }
            await AsyncStorage.removeItem(CANDIDATES_STORAGE_KEY);
            releaseGpsAfterHighConfidence = true;
            BackgroundLogger.info(
              `[BackgroundTask] reason=auto_confirm_ok Auto-confirm successful on backend for lot ${topCandidate.lotId}`,
            );
            await writeTrace(
              "auto_confirm_ok",
              "auto_confirm_ok",
              lots,
              detectOpts,
              null,
              topSummary,
            );
            return;
          }
        }
      } catch (e) {
        BackgroundLogger.error(
          `[BackgroundTask] reason=auto_confirm_api_error Auto-confirm API failed`,
          e,
        );
      }
    }

    BackgroundLogger.info(
      `[BackgroundTask] reason=notification_scheduled Local notification for lot ${topCandidate.lotId}`,
    );
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🚗 ScarletSpots",
        body: `We recorded your parking at ${topCandidate.lotName}. Open the app to see your spot.`,
        data: {
          lotId: topCandidate.lotId,
          action: "confirm_park",
        },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null,
    });
    releaseGpsAfterHighConfidence = true;
    await writeTrace(
      "notification_scheduled",
      topCandidate.autoConfirmable
        ? "notification_after_api_fail"
        : "notification_nearby_confirm",
      lots,
      detectOpts,
      null,
      topSummary,
    );
  } finally {
    const remaining = await getSensorBudgetRemainingMs();
    if (remaining <= 0 || releaseGpsAfterHighConfidence) {
      await stopParkingDetectionLocationUpdatesIfRunning();
    }
  }
}

// ── Background Task Definition ─────────────────────────────────────────────────

TaskManager.defineTask(PARKING_DETECTION_TASK, async ({ data, error }: any) => {
  if (error) {
    BackgroundLogger.error("[BackgroundTask] Manager Error:", error.message);
    return;
  }
  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations || locations.length === 0) return;

  await runParkingDetectionFromLocation(locations.at(-1)!);
});

// ── Public API ─────────────────────────────────────────────────────────────────

export async function getPendingParkingCandidates(): Promise<
  ParkingCandidate[]
> {
  try {
    const raw = await AsyncStorage.getItem(CANDIDATES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearPendingParkingCandidates(): Promise<void> {
  await AsyncStorage.removeItem(CANDIDATES_STORAGE_KEY);
}
