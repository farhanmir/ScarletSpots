# AutoPark / AutoEnd Implementation Status

Last updated: 2026-04-26

## Purpose

This document tracks what has already been implemented in code for native iOS AutoPark / AutoEnd, and what still needs to be completed before the feature can be considered reliable.

This is a code-status document, not a promise that the feature is production-ready yet.

## Current state

The native iOS app now has a much larger AutoPark / AutoEnd foundation in code across:

- `ios/ScarletSpots/Sources/AutoPark/`
- `ios/ScarletSpots/Sources/App/`
- `ios/ScarletSpots/Sources/Services/`
- `ios/ScarletSpots/Sources/Views/`
- `backend/app/routers/park.py`
- `backend/app/models/parking.py`

The backend also has a migration for session source metadata:

- `backend/migrations/versions/d2e4f6a8b1c3_add_session_source_metadata.py`

## Completed in code

### 1. App-owned sensing bootstrap

Implemented:

- AutoPark bootstrap is no longer only UI-owned from `RootView`.
- `AppDelegate` now boots the background-capable flow on launch.
- launch reason handling now distinguishes normal cold launch from location-triggered launch.
- silent push wake now refreshes session truth and re-evaluates eligibility.

Files:

- `ios/ScarletSpots/Sources/App/AppDelegate.swift`
- `ios/ScarletSpots/Sources/App/RootView.swift`
- `ios/ScarletSpots/Sources/App/ScarletSpotsApp.swift`

### 2. Low-power location architecture

Implemented:

- passive monitoring mode
- transient high-accuracy escalation mode
- significant location monitoring
- visit monitoring
- campus region monitoring
- campus proximity checks to avoid unnecessary escalation away from Rutgers

Files:

- `ios/ScarletSpots/Sources/AutoPark/LocationEngine.swift`

### 3. AutoPark trigger engine

Implemented:

- trigger receipt pipeline
- location-triggered start evaluation
- motion-triggered start arming
- Bluetooth disconnect arming
- CarPlay-style car-audio disconnect support via route-change handling
- launch replay trigger support
- gate-by-gate start evaluation
- pending candidate creation for medium-confidence starts
- deterministic idempotency keys for background start requests

Files:

- `ios/ScarletSpots/Sources/AutoPark/AutoParkCoordinator.swift`
- `ios/ScarletSpots/Sources/AutoPark/MotionEngine.swift`
- `ios/ScarletSpots/Sources/AutoPark/AudioRouteEngine.swift`

### 4. AutoEnd trigger engine

Implemented:

- Bluetooth / car-audio reconnect as a departure signal
- driving-resumed signal from motion activity
- sustained drive-away fallback logic
- background end-session request path
- deterministic idempotency key for end requests

Files:

- `ios/ScarletSpots/Sources/AutoPark/AutoParkCoordinator.swift`
- `ios/ScarletSpots/Sources/AutoPark/MotionEngine.swift`
- `ios/ScarletSpots/Sources/AutoPark/AudioRouteEngine.swift`

### 5. Session truth and persistence

Implemented:

- `NativeSessionStore.bootstrapRefresh()`
- session truth source tracking: `server`, `cache`, `none`, `pendingQueue`
- persisted AutoPark state for wake reason, last trigger, last committed lot, parked coordinate, and last failure
- offline queue state now exposes pending types and endpoints for diagnostics

Files:

- `ios/ScarletSpots/Sources/Services/NativeSessionStore.swift`
- `ios/ScarletSpots/Sources/Core/OfflineQueue.swift`
- `ios/ScarletSpots/Sources/AutoPark/AutoParkCoordinator.swift`

### 6. Backend source metadata contract

Implemented:

- parking session start now accepts `source`
- parking session end can accept `source`
- session responses now include `startSource` and `endSource`
- SQLAlchemy model now includes `start_source` and `end_source`
- Alembic migration added for these columns

Files:

- `backend/app/routers/park.py`
- `backend/app/models/parking.py`
- `backend/migrations/versions/d2e4f6a8b1c3_add_session_source_metadata.py`

### 7. Diagnostics transparency

Implemented:

- expanded `AutoParkLiveSnapshot`
- monitoring mode exposed
- wake reason exposed
- decision kind exposed
- queue state exposed
- session truth source exposed
- last failure exposed
- richer Profile diagnostics cards
- richer live insights screen
- clear-history and refresh-session-truth actions

Files:

- `ios/ScarletSpots/Sources/Views/SettingsView.swift`
- `ios/ScarletSpots/Sources/Views/AutoParkInsightsView.swift`
- `ios/ScarletSpots/Sources/AutoPark/AutoParkCoordinator.swift`

### 8. Reference features captured from older docs

Desired/reference feature set found in older implementation notes:

- explicit Bluetooth disconnect arrival signal
- explicit CarPlay disconnect arrival signal
- reconnect-based AutoEnd
- significant-location arrival signal
- motion transition gating
- deferred dispatch while waiting for a fresh GPS fix
- startup/system-health diagnostics
- capability diagnostics for background location / motion
- auto-park smoke-test path
- vulture/searching-behavior observation hooks
- Live Activity support for active parked-car guidance
- structured blocked-reason summaries for diagnostics review
- explicit "event in flight" / "ending session" native state visibility

What is already reflected in current native code:

- Bluetooth / car-audio disconnect arrival signal
- reconnect-based AutoEnd
- significant-location support
- motion gating
- deferred decision flow while waiting for better location context
- native vulture detection and backend report dispatch path
- Live Activity update path through `NativeSessionStore`

What is not yet fully carried over:

- separate first-class CarPlay-specific signal labeling end to end
- startup/system-health diagnostic snapshots equivalent to the older native module
- capability-status reporting equivalent to the older native module
- native smoke-test helper for auto-start then auto-end
- vulture detection/reporting verification and tuning on real devices
- full parity for native "in flight" state reporting that clearly distinguishes:
  - sensing active
  - start evaluation in progress
  - queued start pending replay
  - end evaluation in progress
  - queued end pending replay

### 9. Additional helpful signals and guardrails worth considering

Useful additions found from the surrounding docs and the older native contract, or inferred from the current architecture:

- stronger "freshness-first" gating so old wake locations never trigger immediate confident starts without a refreshed fix
- explicit "event already in flight" suppression to avoid duplicate starts from clustered wake signals
- explicit "ending already in flight" suppression to avoid repeated AutoEnd requests
- diagnostics summaries for top blocked reasons and top failed checks
- background capability-state reporting that surfaces:
  - Always permission status
  - precise vs reduced accuracy
  - motion availability
  - route observer attached state
  - Bluetooth/car-audio observer attached state
  - location services enabled state
- startup health snapshot that records whether the sensing stack actually armed after launch or relaunch
- explicit pending-event-source visibility so diagnostics can explain what the coordinator is currently waiting on
- human-readable "why nothing happened" reporting when a trigger was seen but confidence stayed below threshold
- bounded diagnostics history plus summary counters so transparency stays useful without becoming noisy

These are helpful because they reduce false confidence and make field testing much easier, even when they do not directly create new parking sessions.

## Still needs to be completed

### 1. Real compile/build verification

Not yet completed:

- native iOS build verification in Xcode
- compile error cleanup after the refactor
- runtime integration verification across all touched Swift files

Why this matters:

- the code changes are large and cross-cutting
- background/lifecycle refactors often reveal build or actor-isolation issues only during a real Xcode build

### 2. Real-device behavior validation

Not yet completed:

- physical-device validation of location wake relaunch
- validation of significant-location behavior while the app is suspended
- validation of visit monitoring usefulness
- validation of Bluetooth disconnect/reconnect behavior
- validation of CarPlay-style route changes if available on-device
- validation of drive-away end behavior
- validation of offline queue replay in real network-loss conditions

Why this matters:

- iOS background behavior cannot be trusted from code review alone
- simulator coverage is not enough for these signals

### 3. Force-quit behavior remains best-effort

Not completed and not fully solvable in-app:

- reliable AutoPark/AutoEnd after a user swipe-kills the app

Why this matters:

- iOS may block relaunch after a force-quit
- this remains a platform limitation, not a normal bug fix

### 4. Backend schema rollout

Still needs to be completed operationally:

- run the Alembic migration in the backend environment

Required file:

- `backend/migrations/versions/d2e4f6a8b1c3_add_session_source_metadata.py`

Without this:

- backend and app code can fall out of sync

### 5. Code hardening / cleanup pass

Still recommended:

- verify all manual park/end code paths still match the new backend payload shape
- verify offline end-session queue payloads are consumed correctly
- verify any other views reading session models still behave correctly with the new metadata
- verify diagnostics history and snapshot growth remain bounded and performant
- verify region definitions are the right Rutgers coverage and not too wide or too narrow
- verify whether the app should expose explicit capability/system-health diagnostics like the older module did
- verify the Profile diagnostics view stays current in foreground, background return, queued replay completion, and silent relaunch paths
- verify diagnostics snapshots refresh immediately after every trigger, gate evaluation, queue mutation, session mutation, and failure
- decide whether CarPlay should stay generalized under audio-route handling or become an explicit surfaced signal everywhere
- tune whether vulture/searching-behavior reporting is useful enough to keep as active product scope
- decide whether a dedicated native smoke-test helper should be restored for faster field validation

### 6. Acceptance tests still need to be written or run

Still needed:

- backend tests for start/end `source` handling
- iOS-side targeted tests for evaluation rules
- a documented real-device field test checklist for:
  - foreground start
  - background start
  - location-launch start
  - reconnect end
  - CarPlay disconnect/reconnect if hardware is available
  - drive-away end
  - offline queued start/end replay
  - diagnostics correctness

### 7. Missing feature parity from the old native module

Still not implemented or not clearly restored:

- dedicated startup diagnostics object with fields like:
  - sensing enabled
  - route observer attached
  - vulture observer attached
  - configured network present
  - owner id present
  - pending event source
- diagnostics summary helpers with fields like:
  - total snapshots
  - started count
  - blocked count
  - ready count
  - top blocked reasons
  - top failed checks
- dedicated capability/system-health reporting like:
  - background location ok
  - precise location ok
  - motion ok
  - Bluetooth observer ok
- native smoke-test function that programmatically verifies:
  - disconnect-style auto-start
  - reconnect-style auto-end
  - final session idle state
- parity beyond the current minimal vulture detection/reporting hook set

Why this matters:

- these were part of the broader original native/reference AutoPark toolset
- they improve debugging, field testing, and confidence tuning even if they are not the core session-mutation path

### 8. Diagnostics must stay up to date

This should be treated as a hard product requirement, not a nice-to-have.

The Profile diagnostics page should always reflect the latest native AutoPark / AutoEnd state so the feature never turns into a black box.

That means the diagnostics surface should update after every:

- app launch or relaunch
- location wake
- significant-location event
- visit event
- motion transition
- Bluetooth / audio-route disconnect or reconnect
- gate evaluation
- candidate creation
- session start attempt
- session end attempt
- offline queue enqueue
- offline queue replay success or failure
- session truth refresh
- permission or capability change
- internal error or network failure

Minimum freshness expectations:

- the latest snapshot should include a current timestamp
- the latest snapshot should identify the current monitoring mode and pending work
- the latest snapshot should identify whether a start or end action is in flight
- the latest snapshot should identify whether the app is blocked by permissions, stale location, cooldown, missing lot, active session, or replay state
- returning to the Profile page should never show stale pre-event data if the coordinator already knows something newer

If this is not true, the diagnostics surface is incomplete even if the underlying session logic is correct.

## Suggested definition of done

AutoPark / AutoEnd should only be treated as fully achieved when all of the following are true:

- backend migration applied successfully
- native iOS app builds cleanly in Xcode
- no known compile/runtime integration regressions remain
- real-device tests pass for foreground, background, suspended, and location-relaunch paths
- diagnostics accurately explain every start/end/block/queue path
- diagnostics stay current enough that the latest Profile snapshot matches the coordinator's real internal state
- any intentionally kept signals from the old reference set are either restored or explicitly dropped
- manual park/end still work
- offline queue replay works for both start and end
- false-positive and false-end rates are acceptable after field testing

## Signal and diagnostics checklist

Use this as the feature-completeness matrix for AutoPark / AutoEnd.

Legend:

- `[x]` implemented in code
- `[~]` partially implemented / implemented but not fully verified
- `[ ]` missing

### AutoPark start signals

- `[x]` `significant_location`
- `[x]` `motion_activity`
- `[x]` `bluetooth_disconnect`
- `[~]` `carplay_disconnect` / explicit car-audio disconnect labeling end to end
- `[x]` `launch_replay`
- `[x]` lot containment / lot resolution
- `[x]` cooldown-aware gating
- `[x]` active-session suppression
- `[~]` visit-based usefulness validated on real device
- `[~]` deferred evaluation while waiting for a fresh GPS fix

### AutoEnd signals

- `[x]` Bluetooth / audio reconnect
- `[x]` motion driving-resumed signal
- `[x]` sustained drive-away fallback
- `[x]` active-session requirement before ending
- `[x]` end-request idempotency
- `[~]` CarPlay-style reconnect behavior validated on real device
- `[~]` drive-away thresholds tuned from field testing

### Background and lifecycle behavior

- `[x]` app-owned sensing bootstrap
- `[x]` low-power idle sensing
- `[x]` transient high-accuracy escalation
- `[x]` session-truth bootstrap refresh
- `[x]` silent-push wake reevaluation
- `[~]` cold location relaunch verified on device
- `[~]` suspended/background behavior verified on device
- `[ ]` force-quit reliability

### Diagnostics freshness and anti-blackbox requirements

- `[x]` latest wake reason visible
- `[x]` latest trigger source visible
- `[x]` latest monitoring mode visible
- `[x]` latest queue state visible
- `[x]` latest session-truth source visible
- `[x]` latest failure visible
- `[~]` explicit current "start in flight" state surfaced
- `[~]` explicit current "end in flight" state surfaced
- `[~]` startup health snapshot parity with the older native module
- `[~]` capability/system-health parity with the older native module
- `[~]` diagnostics summary counters for top blocked reasons and failed checks
- `[~]` Profile diagnostics proven to refresh immediately after every native event path
- `[ ]` native smoke-test helper parity
- `[~]` vulture/searching hook baseline exists, but parity/tuning is incomplete

### Testing and rollout

- `[ ]` backend migration applied in deployed environments
- `[ ]` Xcode build verified clean after refactor
- `[ ]` backend source-field tests added or confirmed
- `[ ]` real-device foreground AutoPark test pass complete
- `[ ]` real-device background AutoPark test pass complete
- `[ ]` real-device AutoEnd test pass complete
- `[ ]` real-device offline replay test pass complete
- `[ ]` diagnostics correctness test pass complete

## Brainstorm: additional future signals and heuristics

These are ideas to evaluate carefully, not default requirements. The rule should still be: do not add noisy sensors just because they exist.

### Higher-confidence arrival signals

- change in speed profile:
  - automotive-speed movement followed by a sharp drop to near-zero near a valid lot can strengthen arrival confidence
- heading stabilization after turn-in:
  - if the user leaves a road, slows, and settles inside a lot polygon, confidence can rise without needing long GPS tracking
- recent road-to-lot transition:
  - detecting the last good fix on a road edge followed by a fix inside the lot can reduce false starts from pedestrians
- dwell-time confirmation:
  - require a short stationary dwell before starting if the trigger quality is medium rather than strong
- permit-aware campus filtering:
  - if the user is near campus but only inside incompatible permit areas, block confidently and surface that reason

### Higher-confidence departure signals

- lot-exit crossing:
  - if the parked coordinate starts inside the lot polygon and later exits the polygon at driving speed, that is stronger than distance alone
- increasing-distance trend:
  - multiple successive fixes increasing distance from the parked point is safer than one large jump
- reconnect plus motion:
  - Bluetooth reconnect combined with resumed automotive motion is stronger than reconnect alone
- route resume:
  - if audio route reconnects and motion shifts to automotive within a short window, departure confidence should jump
- anti-bounce protection:
  - if the user briefly moves around the lot and then stops again, suppress AutoEnd

### Signals that may help but need caution

- `CLVisit` arrival/departure semantics:
  - helpful for low power, but often delayed, so it should support confidence rather than act as the sole trigger
- coarse campus geofences by campus or zone:
  - useful to limit when expensive checks run, but too-large regions can create noisy wakeups
- remembered user parking habits:
  - common lots and common times could help ranking, but this must be transparent and avoid overfitting
- local occupancy context:
  - if a lot is known full, suppress low-confidence auto-starts there unless location evidence is very strong
- recent manual correction history:
  - if the user frequently cancels or edits AutoPark in a certain area, lower confidence there

### Signals that are possible but probably too risky or product-heavy right now

- accelerometer-only vehicle-stop inference
- Wi-Fi SSID heuristics
- beacon infrastructure dependency
- calendar/class-schedule inference
- server-side behavior prediction without clear user-facing explanation

These may help in narrow cases, but they increase privacy, fragility, or black-box risk unless handled very carefully.

## Honest status

### Done

- major architecture and feature implementation work is now present in code
- diagnostics transparency is substantially improved
- backend contract has been extended for source metadata

### Not done yet

- production trustworthiness
- flawless behavior
- real-device proof
- operational rollout

## Recommended next steps

1. Run the backend migration.
2. Open the native app in Xcode and fix any compile/runtime issues.
3. Execute a physical-device test pass using the new diagnostics surfaces.
4. Tune heuristics based on actual false positives / false negatives.
5. Update release/readiness docs once the real-device pass is complete.
