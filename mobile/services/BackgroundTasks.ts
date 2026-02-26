import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Accelerometer } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  pushSpeed,
  pushAccel,
  detectParking,
  type LotForDetection,
  type ParkingCandidate,
} from './ParkingDetectionService';
import { PARKING_CONFIDENCE_THRESHOLD } from '../constants/featureFlags';

export const PARKING_DETECTION_TASK = 'SCARLETSPOTS_PARKING_DETECTION';
const CANDIDATES_STORAGE_KEY = 'parking_candidates';

// Global listener for accelerometer in background
let accelSubscription: any = null;

const startAccelTracking = () => {
  if (accelSubscription) return;
  Accelerometer.setUpdateInterval(500);
  accelSubscription = Accelerometer.addListener(data => {
    pushAccel(data);
  });
};

const stopAccelTracking = () => {
  if (accelSubscription) {
    accelSubscription.remove();
    accelSubscription = null;
  }
};

TaskManager.defineTask(PARKING_DETECTION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[BackgroundTask] Error:', error.message);
    return;
  }
  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations || locations.length === 0) return;

  const latestLocation = locations[locations.length - 1];
  const speed = latestLocation.coords.speed;

  // Start accelerometer when we are in active tracking mode
  startAccelTracking();

  // Feed speed into the rolling buffer
  pushSpeed(speed);

  // Load cached lots
  let lots: LotForDetection[] = [];
  try {
    const cachedLotsStr = await AsyncStorage.getItem('cached_lots');
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
    lots
  );

  if (candidates.length === 0) return;

  const topCandidate = candidates[0];

  // Only send notification when confidence is high enough
  if (topCandidate.confidence < PARKING_CONFIDENCE_THRESHOLD) {
    return;
  }

  // Once detected, we can stop accel tracking for this session
  stopAccelTracking();

  // Persist candidates
  await AsyncStorage.setItem(CANDIDATES_STORAGE_KEY, JSON.stringify(candidates));

  // Send push notification
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🚗 ScarletSpots',
      body: `Looks like you parked at ${topCandidate.lotName}. Tap to confirm.`,
      data: {
        lotId: topCandidate.lotId,
        action: 'confirm_park',
      },
    },
    trigger: null,
  });
});

/**
 * Retrieve persisted parking candidates (set by background task).
 */
export async function getPendingParkingCandidates(): Promise<ParkingCandidate[]> {
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
