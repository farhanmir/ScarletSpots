/**
 * Activity signals for auto-park sensor fusion.
 *
 * Architecture overview
 * ---------------------
 * Three signal sources feed a 0–1 "activity boost" that is folded into the
 * detectParking confidence score via `loadActivityBoost()`:
 *
 *   1. Walking hints  — set in JS from BackgroundTasks when step count increases
 *                       while GPS speed is below WALKING_MAX_SPEED_MPS.
 *                       (available today, no native code required)
 *
 *   2. BT audio disconnect — set from a native module that observes
 *                       AVAudioSession route changes (iOS) or
 *                       AudioManager BluetoothProfile callbacks (Android).
 *                       Entry point: markCarAudioDisconnectNow()
 *
 *   3. OS Activity Recognition — set from a native module that observes
 *                       CMMotionActivityManager (iOS) or
 *                       ActivityRecognitionClient (Android).
 *                       Entry point: markNativeAutomotiveActivityNow()
 *
 * Native integration (dev build required)
 * ----------------------------------------
 * Signals 2 and 3 are wired up inside a dev-client build (EAS / expo prebuild).
 * Both native layers call the JS bridges below via NativeModulesProxy or a
 * custom Expo module (see docs/AUTO_PARK_NATIVE_SIGNALS.md for step-by-step).
 *
 * Important: OS Activity Recognition classifies bus / transit as "automotive"
 * on both platforms. Always combine it with the transit-stop-go heuristic in
 * ParkingDetectionService (`isTransitStopGoPattern`) to avoid false positives.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_LAST_WALKING_TS = "ss_activity_last_walking_ts";
const KEY_BT_DISCONNECT_TS = "ss_bt_audio_disconnect_ts";
const KEY_NATIVE_AUTOMOTIVE_TS = "ss_native_automotive_ts";

/** Max age for walking / disconnect hints to count toward boost (ms). */
export const WALKING_WINDOW_MS = 90_000;
export const BT_WINDOW_MS = 120_000;
export const NATIVE_ACTIVITY_WINDOW_MS = 300_000;

/**
 * Call when step count increases while GPS speed is below the walking threshold.
 * Set from BackgroundTasks — speed gate is enforced there before calling this.
 */
export async function markWalkingActivityNow(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_LAST_WALKING_TS, String(Date.now()));
  } catch {
    /* best-effort */
  }
}

/**
 * Entry point for native Bluetooth / audio-route disconnect signal.
 *
 * iOS (native module):
 *   Observe AVAudioSession.routeChangeNotification. When the reason is
 *   .oldDeviceUnavailable and the previous route contained a car audio
 *   (carPlay, carAudio, or bluetoothA2DP) port, call this function.
 *
 * Android (native module):
 *   Register a BluetoothProfile.ServiceListener for BluetoothHeadset /
 *   BluetoothA2dp. On STATE_DISCONNECTED, call this function.
 *
 * Both paths should be guarded so they only fire when the device was
 * previously in "automotive" activity state to avoid spurious triggers.
 */
export async function markCarAudioDisconnectNow(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_BT_DISCONNECT_TS, String(Date.now()));
  } catch {
    /* best-effort */
  }
}

/**
 * Entry point for OS Activity Recognition: automotive → walking transition.
 *
 * iOS (native module):
 *   Start CMMotionActivityManager.startActivityUpdates. On each update,
 *   when activity.automotive == true, record the state. When the next update
 *   shows activity.walking == true (or stationary), call this function.
 *
 * Android (native module):
 *   Request ActivityRecognitionClient updates (ACTIVITY_RECOGNITION is already
 *   declared in app.json). When a DetectedActivity of type IN_VEHICLE → ON_FOOT
 *   transition is detected, call this function.
 *
 * CAUTION: Both platforms classify buses/trains as automotive. Always combine
 * this signal with `isTransitStopGoPattern()` from ParkingDetectionService.
 */
export async function markNativeAutomotiveActivityNow(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_NATIVE_AUTOMOTIVE_TS, String(Date.now()));
  } catch {
    /* best-effort */
  }
}

function msSince(ts: number | null): number {
  if (ts == null || !Number.isFinite(ts)) return Number.POSITIVE_INFINITY;
  return Date.now() - ts;
}

/**
 * Load persisted activity hints and return a composite 0–1 boost for
 * sensor fusion. Contributions:
 *   - Walking hint within 90 s   → +0.35
 *   - BT disconnect within 2 min → +0.25
 *   - Native automotive within 5 min → +0.40
 */
export async function loadActivityBoost(): Promise<number> {
  try {
    const [walkRaw, btRaw, nativeRaw] = await Promise.all([
      AsyncStorage.getItem(KEY_LAST_WALKING_TS),
      AsyncStorage.getItem(KEY_BT_DISCONNECT_TS),
      AsyncStorage.getItem(KEY_NATIVE_AUTOMOTIVE_TS),
    ]);
    const walkTs = walkRaw ? Number(walkRaw) : null;
    const btTs = btRaw ? Number(btRaw) : null;
    const nativeTs = nativeRaw ? Number(nativeRaw) : null;

    let boost = 0;

    if (msSince(walkTs) <= WALKING_WINDOW_MS) {
      boost += 0.35;
    }
    if (msSince(btTs) <= BT_WINDOW_MS) {
      boost += 0.25;
    }
    if (msSince(nativeTs) <= NATIVE_ACTIVITY_WINDOW_MS) {
      boost += 0.4;
    }

    return Math.min(1, boost);
  } catch {
    return 0;
  }
}
