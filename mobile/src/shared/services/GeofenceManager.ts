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
import { wasRecentlyDriving } from "./ParkingDetectionService";
import { getCachedSession, clearCachedSession } from "./OfflineCache";
import { queueParkAction } from "./OfflineQueue";
import { getAccessTokenSilently } from "@/providers/AuthProvider";
import { fetchBackend } from "@/shared/api/api-base";

export const GEOFENCE_TASK_NAME = "SCARLETSPOTS_GEOFENCE_TASK";

interface LotGeoPoint {
  id: string;
  latitude: number;
  longitude: number;
}

let isRegistering = false;
let _lastLots: LotGeoPoint[] = [];

export async function registerLotGeofences(lots: LotGeoPoint[]) {
  if (lots.length === 0) return;
  if (isRegistering) return;
  isRegistering = true;
  _lastLots = lots;

  try {
    let bgStatus: string;
    try {
      const result = await Location.getBackgroundPermissionsAsync();
      bgStatus = result.status;
    } catch (err) {
      console.warn("[GeofenceManager] Failed to check permissions:", err);
      return;
    }

    if (bgStatus !== "granted") {
      console.warn(
        "[GeofenceManager] Background location permission not granted. Geofencing will not work.",
      );
      return;
    }

    const regions = lots
      .filter((lot) => lot.latitude && lot.longitude)
      .slice(0, 20)
      .map((lot) => ({
        identifier: String(lot.id),
        latitude: Number(lot.latitude),
        longitude: Number(lot.longitude),
        radius: 500,
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
    await AsyncStorage.setItem("current_geofence_lot_id", region.identifier);

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

    stopSensorTracking();
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

    try {
      const recentlyDrivingInMemory = wasRecentlyDriving();
      const recentlyDrivingPersisted = await wasDrivingRecentlyForAutoEnd();
      if (!recentlyDrivingInMemory && !recentlyDrivingPersisted) {
        console.log(
          "[GeofenceManager] Exited on foot — keeping session active. End manually or drive out.",
        );
        return;
      }
      const cached = (await getCachedSession()) as {
        session?: { lotId?: string };
      } | null;
      const sessionLotId = cached?.session?.lotId;
      if (sessionLotId && String(region.identifier) === String(sessionLotId)) {
        const accessToken = await getAccessTokenSilently();
        const netState = await NetInfo.fetch();
        if (accessToken) {
          if (netState.isConnected) {
            const response = await fetchBackend("/park/session/end", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
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
