# ScarletSpots

Real-time Rutgers parking, built around a native iOS client, a FastAPI backend, and a small marketing site.

## What lives here

- `ios/`
  The active SwiftUI iOS app. This is the main product client.
- `backend/`
  FastAPI API, occupancy/session logic, forecasting, friendships, favorites, and push fan-out.
- `website/`
  Public landing page and legal/support pages.
- `docs/`
  Release, product, field-testing, and operational notes.

## Current product shape

ScarletSpots bundles static Rutgers lot/building/place data on-device and only fetches dynamic state from the backend.

Static data:
- lot metadata
- polygons
- permit mappings
- permit schedules
- building/place search data

Dynamic data:
- active/historical parking sessions
- live occupancy counts
- occupancy forecast output
- pre-launch pattern-first occupancy metadata (`source`, `confidence`, `signal_strength`)
- favorites
- friendships
- push / notification events

## Repo map

```text
ScarletSpots/
├── ios/                 active Swift app
├── backend/                    FastAPI service + tests + migrations
├── website/                    marketing site + privacy/terms/support pages
├── docs/                       launch and architecture notes
├── README.md
├── ARCHITECTURE.md
├── ROADMAP.md
└── FUTURE_FEATURES.md
```

## Local starting points

### Native iOS

```bash
cd ios/ScarletSpots
xcodegen generate
```

Open `ScarletSpots.xcodeproj` in Xcode and run on a simulator or device.

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows PowerShell
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Website

```bash
cd website
npm install
npm run dev
```

## Canonical docs

- [ARCHITECTURE.md](ARCHITECTURE.md): system layout and major flows
- [ROADMAP.md](ROADMAP.md): completed phases and next work
- [FUTURE_FEATURES.md](FUTURE_FEATURES.md): intentionally deferred ideas
- [WEBSOCKET_BACKGROUND_PARKING_ARCHITECTURE.md](WEBSOCKET_BACKGROUND_PARKING_ARCHITECTURE.md): realtime + background sync notes
- [INFERENCE_GROUND_TRUTH.md](INFERENCE_GROUND_TRUTH.md): occupancy estimation and confidence planning
- pre-launch clients should treat weak-signal occupancy as a typical-pattern estimate, not realtime truth
- [docs/RELEASE_READINESS.md](docs/RELEASE_READINESS.md): launch checklist

## Status snapshot

Implemented:
- native Swift map/search/profile/friends/session flows
- bundled SQLite data pipeline for iOS
- backend session + occupancy APIs
- websocket occupancy and notification fan-out
- push token lifecycle
- forecast endpoint and model scaffolding

In progress:
- launch hardening
- load/perf validation
- occupancy inference calibration
- native UX polish and haptics expansion

Last reviewed: 2026-04-26
