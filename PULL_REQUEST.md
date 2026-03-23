# Auto-Park Architecture Hardening

## Summary

This PR audits and hardens the entire Auto-Park background detection pipeline. It fixes a permissions "black hole" in the onboarding flow, eliminates a runaway background sensor subscription, tightens the detection algorithm against bus/transit false positives, and documents a complete phased path for integrating OS-level Activity Recognition and Bluetooth signals.

---

## Architectural Flaws Found

### 1. Permissions "Black Hole"

**File:** `mobile/app/index.tsx` and `mobile/src/features/onboarding/screens/PermissionsOnboardingScreen.tsx`

The onboarding screen ran `checkInitialStatus()` only once on mount and had no `AppState` listener. If a user followed the "Open Settings" recovery path to enable "Always" or "Precise Location" and then returned to the app, the UI remained frozen on the denied state until the user force-quit and reopened the app.

Additionally, `app/index.tsx`, `AutoParkCapability.ts`, and `getStrictLocationState()` inside onboarding all re-implemented the same "precise + always location granted" check three separate times. These were guaranteed to drift over time.

**Fixes:**
- Extracted a single `needsOnboardingRedirect()` function into `AutoParkCapability.ts`. Both `app/index.tsx` and onboarding now call this shared helper.
- Added an `AppState` listener in `PermissionsOnboardingScreen` that re-runs `checkInitialStatus()` every time the app returns to the foreground, automatically advancing the user past the denied state when they return from iOS/Android Settings.

### 2. Continuous Background Sensor Drain

**File:** `mobile/src/shared/services/BackgroundTasks.ts`

`startSensorTracking()` subscribed the accelerometer and pedometer once, then left them alive for the entire 3-minute geofence budget window — even across multiple location task invocations that produced no parking candidates. `maybeStopSensorsAfterFailedAttempt()` only stopped sensors when the budget hit zero, not when detection was consistently failing.

On iOS, apps that hold active sensor subscriptions between background-location callbacks are at elevated risk of being suspended or terminated by the OS scheduler. On Android, continuous motion-sensor use triggers battery-optimization warnings and increases the chance of the process being reaped.

**Fixes:**
- Added `consecutiveSensorMisses` counter. After `SENSOR_MAX_MISSES = 3` consecutive task invocations with no candidate above threshold, `maybeStopSensorsAfterFailedAttempt()` now stops the sensor subscriptions immediately — regardless of remaining budget. The next location callback will restart them if budget permits.
- `resetSensorMissCount()` is called on successful detection to reset the counter cleanly.
- The sensor budget + consecutive-miss guard now creates a "pulse" pattern: sensors run during the detection window when they're needed, and go dormant between evaluation cycles.

### 3. Inflated Confidence Scores Without Evidence

**File:** `mobile/src/shared/services/ParkingDetectionService.ts`

`computeStillnessScore()` returned a free score of `0.35` when fewer than 5 accelerometer samples were available. `computeHeadingChangeScore()` returned `0.25` with fewer than 3 heading readings. These "charitable defaults" meant the algorithm could approach the confidence threshold on GPS speed alone, without any actual stillness or heading evidence.

**Fix:** Both functions now return `0` when the buffer is too small. The scoring is now honest — confidence only accumulates from signals that have real data behind them.

### 4. The Bus Passenger Problem (False Positives)

**File:** `mobile/src/shared/services/BackgroundTasks.ts` and `ParkingDetectionService.ts`

The most dangerous flaw: `markRecentDrivingSignal()` persisted a "recently driving" timestamp whenever GPS speed exceeded 5 m/s — which a city bus easily achieves. When `computeSpeedTransitionScore()` was later called with `recentDrivingPersisted = true` and the speed buffer showed only walking speeds, it returned `1`, fully satisfying the primary detection signal.

This meant: passenger boards campus bus → bus cruises at 30 km/h → bus stops at a parking lot edge → passenger gets off and walks → app detects "parking event" and auto-confirms a session the user never started.

**Fixes:**
- Added `isTransitStopGoPattern()` in `ParkingDetectionService.ts`. This function scans the speed buffer for the oscillation signature of a transit vehicle: two distinct high-speed segments separated by a near-zero-speed stop. A single parking deceleration produces only one high-speed segment; a bus produces two or more.
- `computeSpeedTransitionScore()` now accepts a `transitPatternDetected` flag. When this is `true`, the `recentDrivingPersisted` shortcut is disabled. In-buffer driving samples still count (a car driving into a lot with a transit-like pattern is unlikely, but not impossible).
- The background task calls `isTransitStopGoPattern()` before `detectParking()` and passes the result through.
- `markWalkingActivityNow()` is now gated: it is only called when the current GPS speed is below `WALKING_MAX_SPEED_MPS = 2.5 m/s`. Steps detected while riding a moving vehicle no longer contribute to the walking-activity boost.

### 5. Silent Auto-Confirm for Nearby-Only Candidates

**File:** `mobile/src/shared/services/BackgroundTasks.ts`

The background task posted to `/park/session` silently (no user confirmation) for any candidate above the confidence threshold — including candidates that were only "nearby" a lot, not actually inside the polygon. Being 80 meters from a lot entrance in a parking-lot-dense area is not sufficient evidence to create a session without the user's knowledge.

**Fix:** Added an `autoConfirmable: boolean` field to `ParkingCandidate`. This flag is `true` only when `insideLot === 1` (the device is inside the lot polygon as determined by ray-cast). The background task's direct server POST is now wrapped in `if (topCandidate.autoConfirmable)`. Nearby-only candidates always fall through to the notification path, where the user sees the confirmation sheet.

---

## How the Fixes Prevent OS Task Killing

The geofence-first wake architecture is preserved and correct — the app does not poll location continuously. After the geofence `Enter` event, the key changes are:

1. **Sensors stop on misses.** After 3 failed detections, sensors are proactively released. The OS sees a brief burst of sensor use around each location event, not a continuous hold across the full 3-minute window.
2. **Budget + miss guard are layered.** If detection is going well, the budget protects against an infinite parking-lot dwell. If detection is failing quickly, the miss guard cleans up early.
3. **Sensors restart on next callback.** If the budget still has time remaining and a new location event arrives, `startSensorTracking()` re-subscribes. This is fine because each re-subscription is brief and tied to foreground background-execution time granted by the OS for the location task.

---

## How Native Signals Plug In

`activitySignals.ts` already exposes two entry points that are no-ops until a native module calls them:

```typescript
// Called from native iOS (CMMotionActivityManager) or Android (ActivityRecognitionClient)
// when automotive → walking transition is detected
markNativeAutomotiveActivityNow();

// Called from native iOS (AVAudioSession) or Android (BluetoothA2dp) 
// when car audio / Bluetooth route disconnects
markCarAudioDisconnectNow();
```

`loadActivityBoost()` folds both signals into the confidence score automatically once they start firing. No changes to `detectParking()` are needed.

Full implementation instructions with native Swift/Kotlin code and JS bridge wiring are in `docs/AUTO_PARK_NATIVE_SIGNALS.md`.

**Important caveat:** Both iOS `CMMotionActivity` and Android `DetectedActivity` classify buses and trains as *automotive*. The `isTransitStopGoPattern()` heuristic in this PR provides a JS-layer safeguard, but it must be kept active even after native signals are integrated.

---

## Manual Test Playbook

### Test 1 — Permissions Recovery (iOS and Android)

1. Fresh install. Walk through onboarding and deliberately deny Location when prompted.
2. Confirm the denied recovery UI appears with "Open Settings" and "I've Enabled It" buttons.
3. Tap "Open Settings". Navigate to the app's location settings and change to "Always" + "Precise".
4. **Expected:** Returning to the app automatically advances to the Motion step without any user tap. (Previously required force-quit and reopen.)
5. Revoke "Always" from Settings while the app is backgrounded. Bring app to foreground.
6. **Expected:** The red banner "Auto-park paused: enable Precise location and Always in Settings." appears on the map screen immediately.

### Test 2 — Bus Passenger False Positive

Simulate on an iOS device using Xcode / Android Emulator with GPX route injection:

1. Create a GPX route that mimics a campus bus: speeds of 10–14 m/s with 20–30 s stops at several points, one of which coincides with a parking lot (use coordinates inside a known lot polygon).
2. Inject the route via Xcode Simulator > Features > Custom Location (or `adb emu geo fix` on Android).
3. With a real driving deceleration: create a GPX that drives at 12 m/s then smoothly decelerates to 0 inside the lot polygon with no subsequent acceleration.
4. **Expected (bus route):** `isTransitStopGoPattern()` returns `true`; `recentDrivingPersisted` shortcut is suppressed; no parking session is created.
5. **Expected (real parking):** Single deceleration into lot; `isTransitStopGoPattern()` returns `false`; session is created and `autoConfirmable = true` for the inside-polygon candidate.

### Test 3 — Consecutive Miss Sensor Cutoff

1. Enter a geofence region.
2. Keep GPS speed above the stopped threshold (e.g. slowly walking through the lot) so no candidate reaches the confidence threshold.
3. After 3 consecutive location callbacks without a candidate, verify sensors are stopped.
4. **How to observe on iOS:** Enable Metro/JS logs or add a temporary log in `stopSensorTracking()`. You should see `stopSensorTracking` called after the 3rd miss, not after the full 3-minute budget expires.

### Test 4 — Auto-Confirm Gating

1. Position the device just outside a lot polygon (50–80 m away).
2. Simulate driving and stopping (use GPX injection).
3. **Expected:** A notification is sent but no session is created silently. Opening the notification shows the confirmation sheet. The nearby candidate has `autoConfirmable = false`.
4. Repeat with device inside the polygon. **Expected:** Silent session creation with no confirmation sheet required.

### Test 5 — Walking Boost Speed Gate

1. Enter a lot geofence while riding transit (simulated via GPX at bus speed).
2. Verify via logs that `markWalkingActivityNow()` is NOT called while speed > 2.5 m/s, even as step counts increment (pedometer fires on a moving bus).
3. Slow to walking speed inside the lot, then confirm `markWalkingActivityNow()` fires and the activity boost is stored.

---

## Files Changed

| File | Change |
|---|---|
| `mobile/src/shared/services/AutoParkCapability.ts` | Export `hasPreciseLocation`, add `needsOnboardingRedirect()` |
| `mobile/app/index.tsx` | Use `needsOnboardingRedirect()` instead of duplicated inline check |
| `mobile/src/features/onboarding/screens/PermissionsOnboardingScreen.tsx` | Add `AppState` listener for auto-advance on return from Settings |
| `mobile/src/shared/services/BackgroundTasks.ts` | Consecutive-miss sensor cutoff, speed-gated walking boost, `autoConfirmable` guard on server POST, pass `transitPatternDetected` to `detectParking` |
| `mobile/src/shared/services/ParkingDetectionService.ts` | `autoConfirmable` on `ParkingCandidate`, transit stop-go detector, fix weak-signal defaults, `transitPatternDetected` option |
| `mobile/src/shared/services/activitySignals.ts` | Full contract documentation for native bridge entry points |
| `docs/AUTO_PARK_NATIVE_SIGNALS.md` | Complete phased native integration guide (iOS + Android + JS bridge) |
| `mobile/src/shared/services/ParkingDetectionService.test.ts` | 14 new tests covering all new heuristics and edge cases |
