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
  type ParkingCandidate,
} from "./ParkingDetectionService";
import { loadActivityBoost, markWalkingActivityNow } from "./activitySignals";
import { getSensorBudgetRemainingMs } from "./autoParkGeofenceKeys";
import { cacheSession } from "./OfflineCache";
import { PARKING_CONFIDENCE_THRESHOLD } from "../constants/featureFlags";

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
const SENSOR_MAX_MISSES = 3;

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
  if ((await getSensorBudgetRemainingMs()) <= 0) {
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
    if (tooManyMisses) {
      // Reset so the next geofence enter starts fresh.
      consecutiveSensorMisses = 0;
    }
  }
}

async function runParkingDetectionFromLocation(
  latestLocation: Location.LocationObject,
): Promise<void> {
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

  const lots = getLotsForDetection();
  if (lots.length === 0) {
    try {
      await AsyncStorage.setItem("parking_detection_buffers", JSON.stringify(getDetectionBuffersSnapshot()));
    } catch {}
    return;
  }

  const recentDrivingPersisted = await wasDrivingRecentlyForAutoEnd();
  const activityBoost = await loadActivityBoost();
  const transitPatternDetected = isTransitStopGoPattern();

  const candidates = detectParking(
    latestLocation.coords.latitude,
    latestLocation.coords.longitude,
    latestLocation.coords.accuracy,
    lots,
    { recentDrivingPersisted, activityBoost, transitPatternDetected },
  );

  if (candidates.length === 0) {
    await maybeStopSensorsAfterFailedAttempt();
    try {
      await AsyncStorage.setItem("parking_detection_buffers", JSON.stringify(getDetectionBuffersSnapshot()));
    } catch {}
    return;
  }

  const topCandidate = candidates[0];

  if (topCandidate.confidence < PARKING_CONFIDENCE_THRESHOLD) {
    await maybeStopSensorsAfterFailedAttempt();
    try {
      await AsyncStorage.setItem("parking_detection_buffers", JSON.stringify(getDetectionBuffersSnapshot()));
    } catch {}
    return;
  }

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
          return;
        }
      }
    } catch {
      // Fall through to the notification path if the API attempt fails.
    }
  }

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
}

// ── Background Task Definition ─────────────────────────────────────────────────

TaskManager.defineTask(PARKING_DETECTION_TASK, async ({ data, error }: any) => {
  if (error) {
    console.error("[BackgroundTask] Error:", error.message);
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
