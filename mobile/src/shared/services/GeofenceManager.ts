import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { AppState } from "react-native";
import { PARKING_DETECTION_TASK, stopSensorTracking } from "./BackgroundTasks";
import { getCachedSession, clearCachedSession } from "./OfflineCache";
import { queueParkAction } from "./OfflineQueue";
import { supabase } from "@/shared/api/supabase-client";
import { fetchBackend } from "@/shared/api/api-base";

export const GEOFENCE_TASK_NAME = "SCARLETSPOTS_GEOFENCE_TASK";

interface LotGeoPoint {
  id: string;
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

export async function registerLotGeofences(lots: LotGeoPoint[]) {
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
      console.warn(
        "[GeofenceManager] Background location permission not granted. Geofencing will not work.",
      );
      return; // lock released by outer finally
    }

    const regions = lots
      .filter((lot) => lot.latitude && lot.longitude)
      .slice(0, 20) // iOS has a strict hard limit of 20 monitored regions per app
      .map((lot) => ({
        identifier: String(lot.id),
        latitude: Number(lot.latitude),
        longitude: Number(lot.longitude),
        radius: 500, // 500 meters radius to trigger "near lot" state
        notifyOnEntry: true,
        notifyOnExit: true,
      }));

    const isRegistered =
      await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME);
    if (isRegistered) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
    }

    await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, regions);
    console.log(`[GeofenceManager] Registered ${regions.length} regions.`);
  } catch (err) {
    console.error("[GeofenceManager] Registration failed:", err);
  } finally {
    isRegistering = false;
  }
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
    console.error("[GeofenceManager] Task error:", error);
    return;
  }
  if (!data) return;
  const { eventType, region } = data;

  if (eventType === Location.GeofencingEventType.Enter) {
    console.log(
      `[GeofenceManager] Entered region: ${region.identifier}. Starting active tracking.`,
    );
    // Save the lot ID we are near
    await AsyncStorage.setItem("current_geofence_lot_id", region.identifier);

    // Start active location tracking with higher accuracy
    await Location.startLocationUpdatesAsync(PARKING_DETECTION_TASK, {
      accuracy: Location.Accuracy.High,
      distanceInterval: 5,
      timeInterval: 2000,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "ScarletSpots",
        notificationBody: "Monitoring parking near lot...",
        notificationColor: "#dc2626",
      },
    });
  } else if (eventType === Location.GeofencingEventType.Exit) {
    console.log(
      `[GeofenceManager] Exited region: ${region.identifier}. Stopping active tracking.`,
    );
    await AsyncStorage.removeItem("current_geofence_lot_id");

    // Stop active tracking and sensors to save battery/memory
    stopSensorTracking();
    await Location.stopLocationUpdatesAsync(PARKING_DETECTION_TASK);

    // Auto-end parking session when user leaves the lot (works without opening the app)
    try {
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
              console.log(
                "[GeofenceManager] Auto-ended session for lot",
                region.identifier,
              );
            }
          } else {
            await queueParkAction("END_PARK", {});
            await clearCachedSession();
            console.log(
              "[GeofenceManager] Offline: queued END_PARK and cleared cache",
            );
          }
        } else {
          await clearCachedSession();
        }
      }
    } catch (err) {
      console.warn("[GeofenceManager] Auto-end session failed:", err);
    }
  }
});
