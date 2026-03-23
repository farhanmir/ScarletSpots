# Native Auto-Park Signals — Integration Guide

The JS-layer auto-park pipeline (geofence wake → GPS speed → accelerometer → pedometer) runs today without any native code. Two additional high-confidence signals can be unlocked in a **development build** (EAS Build / `expo prebuild`):

| Signal | Boost weight | Platform API |
|---|---|---|
| Bluetooth / car-audio disconnect | +0.25 | iOS AVAudioSession, Android BluetoothA2dp |
| OS Activity Recognition (automotive → walking) | +0.40 | iOS CMMotionActivityManager, Android ActivityRecognitionClient |

`loadActivityBoost()` in `activitySignals.ts` already folds these into the fusion pipeline — the native layer just needs to call the entry-point functions documented below.

---

## Phase 1 — Already shipping (no native code)

- Geofence wake (`startGeofencingAsync`, up to 20 regions)
- GPS speed buffer + transit stop-go oscillation detector
- Accelerometer stillness variance
- Pedometer walking hint (speed-gated: only counts steps when GPS < 2.5 m/s)
- Persisted driving timestamp (20-min window, suppressed when transit pattern detected)

## Phase 2 — Dev build: OS Activity Recognition

### iOS — CMMotionActivityManager

```swift
// In your Expo module / AppDelegate
import CoreMotion

let activityManager = CMMotionActivityManager()

func startActivityUpdates() {
    activityManager.startActivityUpdates(to: .main) { activity in
        guard let activity else { return }
        if activity.automotive {
            self.lastAutomotiveDate = Date()
        } else if (activity.walking || activity.stationary),
                  let last = self.lastAutomotiveDate,
                  Date().timeIntervalSince(last) < 300 {
            // Automotive → walking transition within 5 min
            RCTBridge.shared()?.enqueueJSCall("ActivitySignalBridge",
                method: "markNativeAutomotiveActivity", args: [], completion: nil)
        }
    }
}
```

### Android — ActivityRecognitionClient

```kotlin
// In your Expo module
val request = ActivityTransitionRequest(
    listOf(
        ActivityTransition.Builder()
            .setActivityType(DetectedActivity.IN_VEHICLE)
            .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_EXIT)
            .build()
    )
)
ActivityRecognition.getClient(context)
    .requestActivityTransitionUpdates(request, pendingIntent)

// In your BroadcastReceiver
fun onReceive(context: Context, intent: Intent) {
    val result = ActivityTransitionResult.extractResult(intent) ?: return
    for (event in result.transitionEvents) {
        if (event.activityType == DetectedActivity.IN_VEHICLE &&
            event.transitionType == ActivityTransition.ACTIVITY_TRANSITION_EXIT) {
            // Call JS bridge
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("onAutomotiveExit", null)
        }
    }
}
```

### JS bridge (both platforms)

```typescript
// In your native module's JS index
import { NativeEventEmitter, NativeModules } from "react-native";
import { markNativeAutomotiveActivityNow } from "@/shared/services/activitySignals";

const emitter = new NativeEventEmitter(NativeModules.ActivitySignalModule);
emitter.addListener("onAutomotiveExit", () => {
    markNativeAutomotiveActivityNow();
});
```

> **Caution:** Both iOS and Android classify buses and trains as *automotive*. The JS pipeline already calls `isTransitStopGoPattern()` to suppress false positives, but the native signal should be treated as a boost only — never as a hard prerequisite for detection.

---

## Phase 3 — Dev build: Bluetooth / Car Audio Disconnect

### iOS — AVAudioSession route change

```swift
NotificationCenter.default.addObserver(
    forName: AVAudioSession.routeChangeNotification,
    object: nil, queue: .main
) { notification in
    guard let reason = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
          reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue else { return }

    let prev = notification.userInfo?[AVAudioSessionRouteChangePreviousRouteKey]
        as? AVAudioSessionRouteDescription
    let wasCarAudio = prev?.outputs.contains {
        [.carAudio, .bluetoothA2DP, .bluetoothHFP].contains($0.portType)
    } ?? false

    if wasCarAudio {
        // Call JS bridge
        sendEvent("onCarAudioDisconnect", nil)
    }
}
```

### Android — BluetoothA2dp profile listener

```kotlin
val bluetoothAdapter = BluetoothAdapter.getDefaultAdapter()
bluetoothAdapter.getProfileProxy(context, object : BluetoothProfile.ServiceListener {
    override fun onServiceConnected(profile: Int, proxy: BluetoothProfile) {
        // Register state receiver
    }
    override fun onServiceDisconnected(profile: Int) {
        if (profile == BluetoothProfile.A2DP || profile == BluetoothProfile.HEADSET) {
            sendEvent("onCarAudioDisconnect", null)
        }
    }
}, BluetoothProfile.A2DP)
```

### JS bridge

```typescript
emitter.addListener("onCarAudioDisconnect", () => {
    markCarAudioDisconnectNow();
});
```

---

## Testing native signals without hardware

**iOS Simulator:**
- There is no Bluetooth simulation in the iOS simulator. Use a physical device with an OBD/car Bluetooth adapter or a wireless speaker that mimics car audio routes.
- For activity simulation: use the **Xcode Simulator → Features → Location** presets (Freeway Drive, City Run) to simulate speed transitions, then trigger walking manually.

**Android Emulator:**
- Use `adb shell am broadcast -a com.google.android.gms.location.ACTION_ACTIVITY_TRANSITION_RESULT` to inject activity events (requires Google Play Services).
- Use `adb shell am startservice` to start the activity recognition broadcast receiver.

**Unit tests:**
- Call `markNativeAutomotiveActivityNow()` and `markCarAudioDisconnectNow()` directly in tests and verify `loadActivityBoost()` returns the expected value within the time windows.

---

## Fusion weight summary

| Signal | Condition | Boost |
|---|---|---|
| Walking hint | Steps increase + GPS < 2.5 m/s within 90 s | +0.35 |
| BT audio disconnect | Disconnect within 2 min | +0.25 |
| OS automotive → walking | Transition within 5 min | +0.40 |
| Combined max | (all three, capped) | 1.00 |
