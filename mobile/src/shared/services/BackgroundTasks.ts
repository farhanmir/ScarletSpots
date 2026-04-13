import { addParkingListener } from '../../../modules/parking-magic';

/**
 * 🧹 Phase 6: Legacy Polling Tasks Purged
 * The native ParkingMagic module now handles all background sensing hardware-layer triggers.
 */

export function initBackgroundListeners() {
  addParkingListener(async (event) => {
    console.log('[NativeMagic] Parking signal received:', event.source);
    // Future: React to native events if the app is open
  });
}

// All legacy PARKING_DETECTION_TASK and speed-buffer logic removed.
export const PARKING_DETECTION_TASK = 'PARKING_DETECTION_TASK';
export const LOCATION_TRACKING_TASK = 'LOCATION_TRACKING_TASK';
