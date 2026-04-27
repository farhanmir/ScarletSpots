# ScarletSpots Roadmap

## Completed foundations

### Native product pivot

- SwiftUI app is the active client
- bundled SQLite replaced heavy client-side JSON startup paths
- app-owned AutoPark bootstrap moved into the native lifecycle
- widget / Live Activity scaffolding exists

### Core product flows

- Rutgers-only sign-up and sign-in
- permit onboarding and campus filtering
- manual park / end session
- active session restore
- search to map handoff
- favorites and friendships
- lot detail sheet, forecast, and directions

### Backend platform

- migrations and async SQLAlchemy models
- occupancy and forecast APIs
- websocket occupancy + notifications channels
- push token lifecycle
- session source metadata
- attestation/session endpoints

### Public-facing surfaces

- React/Vite landing site
- privacy and terms pages
- release and AutoPark operational docs

## Current priorities

### 1. Launch hardening

- replace the website's placeholder App Store URL with the real listing
- finish App Store review notes, screenshots, and support links
- run and save backend load-test results
- confirm migration and rollback steps for the release candidate

### 2. AutoPark reliability

- verify Xcode build and runtime behavior after recent native refactors
- complete real-device foreground, background, and relaunch testing
- tighten diagnostics freshness so blocked reasons stay obvious
- tune start/end thresholds from field results

### 3. Occupancy quality

- calibrate observed vs pattern blending from real usage
- improve sparse-signal confidence ranges
- decide how far circling and vulture signals should influence current-state estimates
- move popular-lots ranking off placeholder data

### 4. Native polish

- keep reducing noisy copy
- refine haptics where they add clarity
- revisit Live Activity / lock-screen affordances after reliability is steady

## Deferred on purpose

- monetization or subscriptions
- App Clip
- CarPlay
- Siri / App Intents
- multi-campus expansion beyond the current Rutgers data set

## Working rule

New product work should target `ios/`, `backend/`, `website/`, and `docs/` first. Historical JS-first paths are reference material, not the shipping center of gravity.

Last reviewed: 2026-04-26
