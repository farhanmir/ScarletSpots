# ScarletSpots

Real-time Rutgers parking, built around a native iOS app, a FastAPI backend, and a small React/Vite marketing site.

## Repo layout

- `ios/`
  SwiftUI app, AutoPark stack, widget extension, bundled SQLite data, and native auth/onboarding flows.
- `backend/`
  FastAPI service for auth-backed user data, parking sessions, occupancy, forecasts, favorites, friendships, websocket fan-out, push plumbing, and device attestation endpoints.
- `website/`
  Marketing site plus public privacy and terms pages.
- `docs/`
  Release, launch, AutoPark, occupancy, and operational notes.

## Current product split

Static campus data is bundled into the app:

- lot metadata and capacities
- polygons
- buildings and places
- permit mappings
- permit schedules

Dynamic state is served by the backend:

- active parking sessions
- lot occupancy and confidence metadata
- forecast responses
- circling metrics
- favorites
- friendships
- websocket events
- push token lifecycle
- attestation/session tokens

## Local setup

### iOS

```bash
cd ios/ScarletSpots
xcodegen generate
```

Open `ios/ScarletSpots/ScarletSpots.xcodeproj` in Xcode.

Notes:

- the native app expects `IOS_API_BASE_URL`, `IOS_SUPABASE_URL`, and `IOS_SUPABASE_ANON_KEY`
- the project includes a WidgetKit target for Live Activity / session surfaces
- bundled data is generated from `ios/data-sources/` into `ios/ScarletSpots/Resources/scarletspots.sqlite`

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

Useful endpoints once running:

- `http://localhost:8000/health`
- `http://localhost:8000/docs`

### Website

```bash
cd website
npm install
npm run dev
```

## Key product notes

- auth is Supabase-backed, but the native client only accepts Rutgers email domains
- occupancy is intentionally pre-launch-honest: weak signal should render as pattern guidance, not fake realtime certainty
- AutoPark is native-first and centered in `ios/ScarletSpots/Sources/AutoPark`
- the website currently uses a placeholder App Store URL in `website/src/App.jsx`; update that before launch

## Canonical docs

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [ROADMAP.md](ROADMAP.md)
- [FUTURE_FEATURES.md](FUTURE_FEATURES.md)
- [WEBSOCKET_BACKGROUND_PARKING_ARCHITECTURE.md](WEBSOCKET_BACKGROUND_PARKING_ARCHITECTURE.md)
- [INFERENCE_GROUND_TRUTH.md](INFERENCE_GROUND_TRUTH.md)
- [RU_SSO_GUIDE.md](RU_SSO_GUIDE.md)
- [docs/RELEASE_READINESS.md](docs/RELEASE_READINESS.md)
- [docs/AUTOPARK_IMPLEMENTATION_STATUS.md](docs/AUTOPARK_IMPLEMENTATION_STATUS.md)
- [docs/OCCUPANCY_HONESTY_PASS.md](docs/OCCUPANCY_HONESTY_PASS.md)

## Status snapshot

Implemented:

- native SwiftUI map, search, profile, friends, session, and settings flows
- bundled SQLite lookup pipeline for lots, buildings, places, and permits
- backend session, occupancy, forecast, websocket, and push APIs
- pre-launch occupancy confidence metadata
- native AutoPark / AutoEnd foundation, diagnostics, and Live Activity plumbing
- React/Vite launch site and legal pages

Still being hardened:

- real-device AutoPark validation
- launch package and App Store submission details
- load/performance verification
- occupancy calibration from real usage

Last reviewed: 2026-04-26
