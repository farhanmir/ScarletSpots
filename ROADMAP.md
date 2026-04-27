# ScarletSpots Roadmap

## Completed foundations

### Static-data pivot
- bundled lot/building/place data moved client-side
- iOS native app now reads generated SQLite instead of decoding large JSON at startup
- backend lot CRUD was collapsed down to dynamic occupancy/forecast responsibilities

### Core product flows
- parking session start/end
- active session restore
- friends and requests
- favorites
- search to map handoff
- lot detail sheet, forecast, and directions

### Native iOS rebuild
- SwiftUI app is now the active product client
- foreground and background sensing paths exist in Swift
- lot polygons, pins, and search are native
- profile/settings/permit onboarding are native

### Operational base
- backend tests and migrations
- website/legal pages
- manual iOS build workflow
- load-test scaffold

## Current priorities

### 1. Release hardening
- run realistic backend load tests
- finish App Store review notes / screenshots / rollout package
- verify push, background sensing, and permission copy on physical devices

### 2. Occupancy quality
- improve sampling-bias correction
- tighten confidence ranges
- move popular-lots/search ranking from placeholder data to actual usage-driven ranking

### 3. Native polish
- continue meaningful haptics
- keep reducing noisy or overly wordy UI
- expand Live Activity / lock-screen support only after core reliability is steady

## Deferred on purpose

- monetization / premium
- App Clip
- CarPlay
- Siri / App Intents
- multi-campus expansion beyond the current supported data set

## Keep in mind

- new product work should target `ios/`, `backend/`, `website/`, and `docs/`

Last reviewed: 2026-04-26
