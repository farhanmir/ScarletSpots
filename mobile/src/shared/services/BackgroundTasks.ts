import { addParkingListener, startSensing, stopSensing } from '../../../modules/parking-magic';

/**
 * 🧹 Phase 6: Legacy Polling Tasks Purged
 * The native ParkingMagic module now handles all background sensing hardware-layer triggers.
 * initBackgroundListeners() MUST be called early in the app lifecycle to activate the Swift
 * sensing engine. It returns a cleanup function that should be called on unmount.
 */
export function initBackgroundListeners(): () => void {
  // Start the native sensing engine (Swift CMMotionActivityManager + AVAudioSession observers)
  startSensing();

  const subscription = addParkingListener(async (event) => {
    console.log('[NativeMagic] Parking signal received:', event.source, event.lotId);
    // React to native events when the app is in the foreground
    // Background events are handled directly by the Swift NetworkManager
  });

  // Return cleanup so callers (e.g. useEffect) can teardown properly
  return () => {
    subscription.remove();
    stopSensing();
  };
}

// Legacy constants kept for any remaining import sites during migration
export const PARKING_DETECTION_TASK = 'PARKING_DETECTION_TASK';
export const LOCATION_TRACKING_TASK = 'LOCATION_TRACKING_TASK';
