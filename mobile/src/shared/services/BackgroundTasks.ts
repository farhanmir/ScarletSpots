import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { Accelerometer, Pedometer } from "expo-sensors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAccessTokenSilently } from "@/providers/AuthProvider";
import { fetchBackend, safeJson } from "@/shared/api/api-base";
import {
  pushSpeed,
  pushAccel,
  pushHeading,
  pushSteps,
  detectParking,
  type LotForDetection,
  type ParkingCandidate,
} from "./ParkingDetectionService";
import { cacheSession } from "./OfflineCache";
import { PARKING_CONFIDENCE_THRESHOLD } from "../constants/featureFlags";

export const PARKING_DETECTION_TASK = "SCARLETSPOTS_PARKING_DETECTION";
const CANDIDATES_STORAGE_KEY = "parking_candidates";
const RECENT_DRIVING_TS_KEY = "recent_driving_ts";
const DRIVING_SPEED_SIGNAL_MPS = 5;
const RECENT_DRIVING_WINDOW_MS = 1000 * 60 * 20;

async function markRecentDrivingSignal(speed: number | null): Promise<void> {
  if (speed == null || speed < DRIVING_SPEED_SIGNAL_MPS) return;
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

let accelSubscription: any = null;
let pedometerSubscription: any = null;

const startSensorTracking = async () => {
  // Accelerometer
  if (!accelSubscription) {
    Accelerometer.setUpdateInterval(500);
    accelSubscription = Accelerometer.addListener((data) => {
      pushAccel(data);
    });
  }

  // Pedometer
  if (!pedometerSubscription) {
    const isAvailable = await Pedometer.isAvailableAsync();
    // Re-check after await in case stopSensorTracking was called concurrently
    if (isAvailable && !pedometerSubscription) {
      pedometerSubscription = Pedometer.watchStepCount((result) => {
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
};

// ── Background Task Definition ─────────────────────────────────────────────────

TaskManager.defineTask(PARKING_DETECTION_TASK, async ({ data, error }: any) => {
  if (error) {
    console.error("[BackgroundTask] Error:", error.message);
    return;
  }
  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations || locations.length === 0) return;

  const latestLocation = locations.at(-1)!;
  const speed = latestLocation.coords.speed;
  const heading = latestLocation.coords.heading;

  // Start sensors when we are in active tracking mode
  await startSensorTracking();

  // Feed signals into the rolling buffers
  pushSpeed(speed);
  await markRecentDrivingSignal(speed);
  pushHeading(heading);

  // Load cached lots for comparison
  let lots: LotForDetection[] = [];
  try {
    const cachedLotsStr = await AsyncStorage.getItem("cached_lots");
    if (cachedLotsStr) {
      lots = JSON.parse(cachedLotsStr);
    }
  } catch {
    return;
  }

  if (lots.length === 0) return;

  // Run the multi-signal detection pipeline
  const candidates = detectParking(
    latestLocation.coords.latitude,
    latestLocation.coords.longitude,
    latestLocation.coords.accuracy,
    lots,
  );

  if (candidates.length === 0) return;

  const topCandidate = candidates[0];

  // Only proceed when confidence is high enough
  if (topCandidate.confidence < PARKING_CONFIDENCE_THRESHOLD) {
    return;
  }

  // Once detected, we can stop expensive sensor tracking for this session
  stopSensorTracking();

  // Persist candidates so the UI can prompt the user on app foreground
  await AsyncStorage.setItem(
    CANDIDATES_STORAGE_KEY,
    JSON.stringify(candidates),
  );

  // Try true background auto-start first so parking can begin even when the
  // app UI is closed. If this fails, we keep pending candidates for foreground.
  try {
    const accessToken = await getAccessTokenSilently();

    if (accessToken) {
      const response = await fetchBackend("/park/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
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
    // Keep fallback candidate prompt path if background API attempt fails.
  }

  // Send immediate local notification
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
});

/**
 * Retrieve persisted parking candidates (set by background task).
 */
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

/**
 * Clear pending candidates (after user confirms or dismisses).
 */
export async function clearPendingParkingCandidates(): Promise<void> {
  await AsyncStorage.removeItem(CANDIDATES_STORAGE_KEY);
}
