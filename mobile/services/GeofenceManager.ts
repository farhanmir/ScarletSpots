import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PARKING_DETECTION_TASK } from './BackgroundTasks';

export const GEOFENCE_TASK_NAME = 'SCARLETSPOTS_GEOFENCE_TASK';

/**
 * Registers geofences for all known lots.
 * When a user enters a geofence, we start more intensive location/sensor tracking.
 */
export async function registerLotGeofences(lots: any[]) {
  if (lots.length === 0) return;

  // Check permissions first
  try {
    const { status: bgStatus } = await Location.getBackgroundPermissionsAsync();
    if (bgStatus !== 'granted') {
      console.warn('[GeofenceManager] Background location permission not granted. Geofencing will not work.');
      return;
    }
  } catch (err) {
    console.warn('[GeofenceManager] Failed to check permissions:', err);
    return;
  }

  const regions = lots.map(lot => ({
    identifier: lot.id,
    latitude: lot.latitude,
    longitude: lot.longitude,
    radius: 500, // 500 meters radius to trigger "near lot" state
    notifyOnEntry: true,
    notifyOnExit: true,
  }));

  try {
    const isRegistered = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME);
    if (isRegistered) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
    }
    
    await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, regions);
    console.log(`[GeofenceManager] Registered ${regions.length} regions.`);
  } catch (err) {
    console.error('[GeofenceManager] Registration failed:', err);
  }
}

TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data: { eventType, region }, error }: any) => {
  if (error) {
    console.error('[GeofenceManager] Task error:', error);
    return;
  }

  if (eventType === Location.GeofencingEventType.Enter) {
    console.log(`[GeofenceManager] Entered region: ${region.identifier}. Starting active tracking.`);
    // Save the lot ID we are near
    await AsyncStorage.setItem('current_geofence_lot_id', region.identifier);
    
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
      }
    });
  } else if (eventType === Location.GeofencingEventType.Exit) {
    console.log(`[GeofenceManager] Exited region: ${region.identifier}. Stopping active tracking.`);
    await AsyncStorage.removeItem('current_geofence_lot_id');
    
    // Stop active tracking to save battery
    await Location.stopLocationUpdatesAsync(PARKING_DETECTION_TASK);
  }
});
