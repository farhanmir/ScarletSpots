# Native Auto-Park Signals

This document describes the current signal family for the Swift-native app, not the old JS-first pipeline.

## Primary signal buckets

- location and lot containment
- motion/activity context
- audio / route-change context where available
- session history and cooldown logic

## Product rule

No single weak signal should force a confident parking action. Signals should combine to raise or lower confidence.

## Current implementation center

- `ios/ScarletSpots/Sources/AutoPark/LocationEngine.swift`
- `ios/ScarletSpots/Sources/AutoPark/AutoParkCoordinator.swift`
- `ios/ScarletSpots/Sources/AutoPark/AudioRouteEngine.swift`
- `ios/ScarletSpots/Sources/AutoPark/MotionEngine.swift`

## Near-term engineering direction

- continue tuning confidence rather than adding many new sensors blindly
- expose enough diagnostics for field testing
- keep manual correction paths first-class

Last reviewed: 2026-04-26
