import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { AppState } from "react-native";
import {
  PARKING_DETECTION_TASK,
  stopSensorTracking,
  wasDrivingRecentlyForAutoEnd,
} from "./BackgroundTasks";
import { GEOFENCE_ACTIVE_TRACKING_START_KEY } from "./autoParkGeofenceKeys";
import {
  clearAllDetectionBuffers,
  haversineDistance,
  wasRecentlyDriving,
} from "./ParkingDetectionService";
import { getCachedSession, clearCachedSession } from "./OfflineCache";
import { queueParkAction } from "./OfflineQueue";
import { supabase } from "@/shared/api/supabase-client";
import { fetchBackend } from "@/shared/api/api-base";
import { BackgroundLogger } from "../utils/Logger";

export const GEOFENCE_TASK_NAME = "SCARLETSPOTS_GEOFENCE_TASK";

interface LotGeoPoint {
  id: string;
  latitude: number;
  longitude: number;
}

interface GeoPoint {
  latitude: number;
  longitude: number;
}

/**
 * Registers geofences for parking lots from the bundled JSON data.
 * Lot coordinates come from the static data — no API call needed.
 * When a user enters a geofence, intensive location/sensor tracking starts.
 */
let isRegistering = false;
/** Last lot set passed to registerLotGeofences — used by the retry listener. */
let _lastLots: LotGeoPoint[] = [];
let _lastRegistrationPoint: GeoPoint | null = null;
const REREGISTER_DISTANCE_METERS = 3000;
const MACRO_GEOFENCE_ID = "MACRO_GEOFENCE";

async function _resolveUserLocation(
  userLocation?: GeoPoint,
): Promise<GeoPoint | null> {
  if (userLocation) {
    return userLocation;
  }
  try {
    const lastKnown = await Location.getLastKnownPositionAsync();
    if (!lastKnown) {
      return null;
    }
    return {
      latitude: lastKnown.coords.latitude,
      longitude: lastKnown.coords.longitude,
    };
  } catch {
    return null;
  }
}

export async function registerLotGeofences(
  lots: LotGeoPoint[],
  userLocation?: GeoPoint,
) {
  if (lots.length === 0) return;
  if (isRegistering) return;
  isRegistering = true;
  _lastLots = lots;

  // Single try/finally guarantees isRegistering is reset on every exit path,
  // including permission-denied and permission-check-error early-outs.
  try {
    // Check permissions — fail fast but always release the lock via finally.
    let bgStatus: string;
    try {
      const result = await Location.getBackgroundPermissionsAsync();
      bgStatus = result.status;
    } catch (err) {
      console.warn("[GeofenceManager] Failed to check permissions:", err);
      return; // lock released by outer finally
    }

    if (bgStatus !== "granted") {
      BackgroundLogger.warn(
        "[GeofenceManager] Background location permission not granted. Geofencing will not work.",
      );
      return; // lock released by outer finally
    }

    const resolvedUserLocation = await _resolveUserLocation(userLocation);
    const sortedLots = resolvedUserLocation
      ? [...lots].sort(
          (a, b) =>
            haversineDistance(
              resolvedUserLocation.latitude,
              resolvedUserLocation.longitude,
              a.latitude,
              a.longitude,
            ) -
            haversineDistance(
              resolvedUserLocation.latitude,
              resolvedUserLocation.longitude,
              b.latitude,
              b.longitude,
            ),
        )
      : [...lots];

    const regions = sortedLots
      .filter((lot) => lot.latitude && lot.longitude)
      .slice(0, 19) // iOS has a strict hard limit of 20 monitored regions per app; save 1 for macro
      .map((lot) => ({
        identifier: String(lot.id),
        latitude: Number(lot.latitude),
        longitude: Number(lot.longitude),
        radius: 500, // 500 meters radius to trigger "near lot" state
        notifyOnEntry: true,
        notifyOnExit: true,
      }));

    if (resolvedUserLocation) {
      regions.push({
        identifier: MACRO_GEOFENCE_ID,
        latitude: resolvedUserLocation.latitude,
        longitude: resolvedUserLocation.longitude,
        radius: REREGISTER_DISTANCE_METERS,
        notifyOnEntry: false,
        notifyOnExit: true,
      });
    }

    const isRegistered =
      await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME);
    if (isRegistered) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
    }

    await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, regions);
    if (resolvedUserLocation) {
      _lastRegistrationPoint = resolvedUserLocation;
    }
    BackgroundLogger.info(`[GeofenceManager] Registered ${regions.length} regions.`);
  } catch (err) {
    BackgroundLogger.error("[GeofenceManager] Registration failed:", err);
  } finally {
    isRegistering = false;
  }
}

export async function bootstrapLotGeofenceRegistration(lots: LotGeoPoint[]) {
  await registerLotGeofences(lots);
}

export function teardownLotGeofenceRegistration() {
  Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME).then((isRegistered) => {
    if (isRegistered) Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
  });
}

/**
 * Re-attempt geofence registration when the app returns to the foreground.
 * This handles the common case where the user navigates to iOS Settings,
 * grants background location, then returns — the lock is now clear and
 * registration will succeed on the next foreground transition.
 */
AppState.addEventListener("change", (nextState) => {
  if (nextState === "active" && _lastLots.length > 0) {
    registerLotGeofences(_lastLots).catch((err) =>
      console.warn("[GeofenceManager] Foreground retry failed:", err),
    );
  }
});

TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }: any) => {
  if (error) {
    BackgroundLogger.error("[GeofenceManager] Task error:", error);
    return;
  }
  if (!data) return;
  const { eventType, region } = data;

  if (region.identifier === MACRO_GEOFENCE_ID) {
    if (eventType === Location.GeofencingEventType.Exit) {
      BackgroundLogger.info(
        `[GeofenceManager] Exited MACRO_GEOFENCE. Re-registering lots.`,
      );
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        await registerLotGeofences(_lastLots, {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      } catch (err) {
        console.warn(
          "[GeofenceManager] Failed to re-register on macro exit:",
          err,
        );
      }
    }
    return;
  }

  if (eventType === Location.GeofencingEventType.Enter) {
    BackgroundLogger.info(
      `[GeofenceManager] Entered region: ${region.identifier}. Starting active tracking.`,
    );
    // Save the lot ID we are near
    await AsyncStorage.setItem("current_geofence_lot_id", region.identifier);
    await AsyncStorage.setItem(
      GEOFENCE_ACTIVE_TRACKING_START_KEY,
      String(Date.now()),
    );

    try {
      const already = await Location.hasStartedLocationUpdatesAsync(
        PARKING_DETECTION_TASK,
      );
      if (already) {
        await Location.stopLocationUpdatesAsync(PARKING_DETECTION_TASK);
      }
    } catch {
      /* ignore */
    }

    // Balanced updates: geofence already woke the app; avoid 5 m / 2 s + High accuracy churn.
    await Location.startLocationUpdatesAsync(PARKING_DETECTION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 15,
      deferredUpdatesDistance: 15,
      deferredUpdatesInterval: 5000,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "ScarletSpots",
        notificationBody: "Monitoring parking near lot...",
        notificationColor: "#dc2626",
      },
    });
  } else if (eventType === Location.GeofencingEventType.Exit) {
    BackgroundLogger.info(
      `[GeofenceManager] Exited region: ${region.identifier}. Stopping active tracking.`,
    );
    await AsyncStorage.removeItem("current_geofence_lot_id");
    await AsyncStorage.removeItem(GEOFENCE_ACTIVE_TRACKING_START_KEY);

    // Stop active tracking and sensors to save battery/memory.
    // Do not let this throw block the auto-end flow.
    stopSensorTracking();
    clearAllDetectionBuffers();
    try {
      const isTracking = await Location.hasStartedLocationUpdatesAsync(
        PARKING_DETECTION_TASK,
      );
      if (isTracking) {
        await Location.stopLocationUpdatesAsync(PARKING_DETECTION_TASK);
      }
    } catch (err) {
      console.warn("[GeofenceManager] Failed to stop active tracking:", err);
    }

    // Auto-end parking session only when user DRIVES out (not when walking to class)
    try {
      const recentlyDrivingInMemory = wasRecentlyDriving();
      const recentlyDrivingPersisted = await wasDrivingRecentlyForAutoEnd();
      if (!recentlyDrivingInMemory && !recentlyDrivingPersisted) {
        BackgroundLogger.info(
          "[GeofenceManager] Exited on foot — keeping session active. End manually or drive out.",
        );
        return;
      }
      const cached = (await getCachedSession()) as {
        session?: { lotId?: string };
      } | null;
      const sessionLotId = cached?.session?.lotId;
      if (sessionLotId && String(region.identifier) === String(sessionLotId)) {
        const {
          data: { session: authSession },
        } = await supabase.auth.getSession();
        const netState = await NetInfo.fetch();
        if (authSession?.access_token) {
          if (netState.isConnected) {
            const response = await fetchBackend("/park/session/end", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authSession.access_token}`,
                apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "",
              },
              body: "{}",
            });
            if (response.ok) {
              await clearCachedSession();
              BackgroundLogger.info(
                "[GeofenceManager] Auto-ended session for lot " + region.identifier,
              );
            }
          } else {
            await queueParkAction("END_PARK", {});
            await clearCachedSession();
            BackgroundLogger.info(
              "[GeofenceManager] Offline: queued END_PARK and cleared cache",
            );
          }
        } else {
          await clearCachedSession();
        }
      }
    } catch (err) {
      BackgroundLogger.error("[GeofenceManager] Auto-end session failed:", err);
    }
  }
});
