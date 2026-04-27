# Native Auto-Park Signals

This document describes the current signal family for the Swift-native app.

## Primary signal buckets

- location freshness and lot containment
- motion and drive-state context
- audio-route or Bluetooth-adjacent context where available
- session history, cooldown, and active-session suppression
- vulture/circling observation hooks for noisy parking-search behavior

## Product rule

No single weak signal should force a confident parking action. Signals should combine to raise or lower confidence, and diagnostics should expose why.

## Current implementation center

- `ios/ScarletSpots/Sources/AutoPark/LocationEngine.swift`
- `ios/ScarletSpots/Sources/AutoPark/AutoParkCoordinator.swift`
- `ios/ScarletSpots/Sources/AutoPark/AudioRouteEngine.swift`
- `ios/ScarletSpots/Sources/AutoPark/MotionEngine.swift`
- `ios/ScarletSpots/Sources/Views/AutoParkInsightsView.swift`

## Near-term engineering direction

- tune confidence with field data instead of adding sensors blindly
- keep manual park/end correction first-class
- preserve high-quality diagnostics for blocked or partial signal paths
- validate whether vulture reporting produces useful signal or just noise

Last reviewed: 2026-04-26
