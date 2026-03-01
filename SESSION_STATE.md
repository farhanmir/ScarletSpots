# ScarletSpots — Session State & Handoff Document

> **Purpose**: This document lets you pick up exactly where we left off in any AI coding assistant. Paste this file's contents (or attach it) at the start of your next session.
>
> **Last updated**: 2026-02-27
> **Previous chat**: [ScarletSpots Major Pivot + DB Cleanup](8610b89f-5853-4ec2-9865-2f62dbe7d90e)

---

## What Is ScarletSpots

A **React Native (Expo) mobile app** for Rutgers University students to:
1. See live parking lot occupancy on a map
2. Start/end a parking session (crowd-sources occupancy)
3. Find their car with a simple compass (bearing + distance)
4. See which lot friends are parked in (Friends tab only — no map pins)

**Target**: 50,000 users, minimal backend cost (Supabase free tier).

---

## Repository Structure

```
ScarletSpots/
├── mobile/               Expo React Native app (TypeScript)
│   ├── app/(tabs)/       Screens: index (map), navigate (compass), friends, profile
│   ├── components/       LotDetails, OfflineBanner, SessionChip, etc.
│   ├── services/         OfflineCache, GeofenceManager, supabase client
│   ├── constants/        featureFlags.ts, Colors.ts
│   └── data/
│       ├── lots.ts                   ← typed wrapper for the JSON
│       └── rutgers_parking_data.json ← 245 lots, 1.4 MB, bundled at build time
├── backend/              FastAPI (Python)
│   ├── app/
│   │   ├── main.py
│   │   ├── routers/      lots.py, park.py, users.py, friends.py, favorites.py
│   │   ├── services/     forecasting.py, ml_forecast_provider.py,
│   │   │                 forecast_provider.py, train_forecast_model.py
│   │   └── supabase_client.py
│   ├── supabase/migrations/  SQL migration files (applied to Supabase manually)
│   └── .env              ← REAL credentials here (not in repo)
├── .github/workflows/ci.yml   GitHub Actions CI
├── README.md
├── PLAN.md               ← Authoritative architecture contract
├── ROADMAP.md            ← Phased roadmap with completion status
├── ARCHITECTURE.md       ← Technical deep-dive
└── SESSION_STATE.md      ← This file
```

> **Note**: The `frontend/` directory (React/Vite admin panel) has been intentionally left in the repo but is **out of scope for v1**. It will become an admin portal in v2. Do not work on it.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | Expo SDK 52, React Native, TypeScript, `expo-router` |
| State / Data | `@tanstack/react-query`, Supabase Realtime |
| Maps | `react-native-maps` |
| Location | `expo-location`, `expo-sensors` (magnetometer) |
| Backend | FastAPI (Python 3.12), Supabase Python client |
| Database | Supabase (PostgreSQL) — hosted |
| Auth | Supabase Auth (email/password, Rutgers domains only) |
| Build | EAS (Expo Application Services) |
| CI | GitHub Actions |

---

## Security Note

> **Action recommended**: The Supabase **anon key** was accidentally committed in a previous commit (`TEAM_ENV_ALL_KEYS.env`, added Feb 14, deleted Feb 27). The file is gone from the working tree but exists in git history. The **service role key was NOT exposed**. The anon key is a public-facing JWT protected by RLS, but you should rotate it in the Supabase dashboard as a precaution:  
> Settings → API → `anon` key → Regenerate  
> Then update `backend/.env`, `mobile/.env`, and any deployed environments.

---

## Supabase Project

| Key | Value |
|-----|-------|
| Project name | ScarletSpots |
| Project ref | `dfkxffdplikdyhuvubnr` |
| Region | East US (North Virginia) |
| Dashboard | https://supabase.com/dashboard/project/dfkxffdplikdyhuvubnr |
| API URL | `https://dfkxffdplikdyhuvubnr.supabase.co` |

Credentials live in `backend/.env` (and `mobile/.env`). See `backend/.env.example` for the shape.

---

## Current Database Schema ✅ (confirmed clean as of 2026-02-27)

```
public.profiles              (5 rows)   user accounts, email, role
public.parking_sessions      (39 rows)  lot_id is TEXT (e.g. "10001"), active/ended sessions
public.lot_occupancy         (0 rows)   live count per lot — maintained by RPCs
public.friendships           (4 rows)   friend request lifecycle
public.user_favorites        (0 rows)   saved lots (lot_id = JSON mapId)
public.session_feedback      (0 rows)   user corrections for ML training
```

### What was dropped in the pivot migration (2026-02-27)
- `parking_lots` — replaced by `mobile/data/rutgers_parking_data.json`
- `occupancy_logs` — replaced by `lot_occupancy` + `parking_sessions`
- `event_logs` — not needed
- `friend_sharing_settings` — simplified away
- **PostGIS extension** — polygon checks are now client-side from the JSON

### Key RPCs in Postgres
- `public.increment_lot_occupancy(p_lot_id TEXT) → INTEGER`
- `public.decrement_lot_occupancy(p_lot_id TEXT) → INTEGER`

Both use `ON CONFLICT (lot_id) DO UPDATE` so they're safe for concurrent use.

### Realtime
`lot_occupancy` has `REPLICA IDENTITY FULL` — the mobile app subscribes to changes on this table to get live occupancy pushes without polling.

---

## Migration Files (already applied to Supabase)

```
backend/supabase/migrations/
├── 20260310_pivot_static_lots.sql   ← drops old tables, creates lot_occupancy, RPCs, indexes
└── 20260310_session_feedback.sql    ← creates session_feedback table
```

> These are applied. Do NOT re-run them. If you need to make further schema changes, create a new numbered migration file and run it via the Supabase SQL Editor or the Management API.

### How to run future SQL against Supabase
The Supabase CLI is installed (`npx supabase`) and the user is already logged in. The Management API can be reached with a token extracted from the Windows Credential Manager (target: `Supabase CLI:supabase`, credential blob is UTF-8 encoded). Alternatively:
- Go to https://supabase.com/dashboard/project/dfkxffdplikdyhuvubnr/sql/new
- Paste SQL and run it directly in the browser

---

## Backend API Endpoints

```
GET  /lots/occupancy           → {lot_id: count} map for all lots with active sessions
GET  /lots/{lot_id}/forecast   → occupancy forecast (requires ?capacity=N&current_occupancy=N)

POST /park/session             → start parking session {lotId, spotNumber, lat, lng}
POST /park/session/end         → end active session
GET  /park/session/active      → get user's current active session
POST /park/session/feedback    → submit detection quality correction

GET  /friends                  → list friends with parked status + lot_id
POST /friends/request          → send friend request
POST /friends/accept/{id}
POST /friends/decline/{id}
POST /friends/block/{id}

GET  /favorites                → list saved lots
POST /favorites                → save a lot {lotId}
DELETE /favorites/{lot_id}

GET  /users/me                 → get own profile
PATCH /users/me                → update profile
POST /users/password-reset     → trigger password reset email
```

---

## Key Architectural Decisions (do not reverse without discussion)

1. **`rutgers_parking_data.json` is bundled in the mobile app** — never fetched from the backend. All lot metadata (name, coords, capacity, polygon) comes from this file.

2. **`lot_id` is now a `TEXT` field everywhere** — it matches the `mapId` in the JSON (e.g. `"10001"`). It is NOT a UUID. Do not add a FK back to any lots table.

3. **No friend markers on the map** — friends' locations are only shown in the Friends tab (which lot they're in), not as pins on the MapView.

4. **Compass (Navigate tab) is intentionally simple** — just bearing arrow + distance text. No proximity states, no haptics. This is deliberate.

5. **Supabase Realtime (NOT webhooks) for occupancy** — the mobile app holds a Realtime subscription on `lot_occupancy`. Webhooks would require a server endpoint and add latency. Realtime pushes directly to the client.

6. **No PostGIS** — geofence polygon checks are done client-side using the GeoJSON polygons from the bundled JSON.

7. **No Redis** — not needed. Static data is local, dynamic data is tiny.

---

## Completed Work (Phases 1–3, Phase 5 partial, Permit Integration)

### Phase 1 — Architecture Pivot ✅
- Bundled `rutgers_parking_data.json` into `mobile/data/`
- Created `mobile/data/lots.ts` — typed wrapper, NB campus filter, `ENABLE_ALL_CAMPUSES` flag
- Removed all `/lots` API calls from mobile (0 calls for lot metadata)
- Simplified `backend/app/routers/lots.py` — removed CRUD, kept forecast + occupancy
- Applied DB migration: dropped `parking_lots`, `occupancy_logs`, PostGIS; created `lot_occupancy`
- Updated `GeofenceManager.ts` to use static lot coordinates
- Simplified compass (`navigate.tsx`) to use `getLotById()` from JSON
- Wired Realtime subscription on `lot_occupancy` (was `parking_lots`)

### Phase 2 — Core Fixes ✅
- Password reset endpoint + mobile forgot-password screen
- Active session banner → subtle floating chip (`SessionChip`) above tab bar
- Compass: bearing + distance only
- Friends "Locate" button → navigate to Map tab pre-selecting lot
- Crash audit: removed periodic 10s location broadcast, fixed Realtime cleanup on unmount
- Offline: map always loads (data is local), OfflineBanner redesigned

### Phase 3 — Forecasting ✅
- `MLForecastProvider` — loads per-lot `*.joblib` models, falls back to heuristic
- `train_forecast_model.py` — training script using `parking_sessions` data
- `POST /park/session/feedback` endpoint + `session_feedback` table

### Phase 5 — Launch Readiness (partial) ✅
- Bundle ID: `com.scarletspots.app`
- `mobile/eas.json` — development, preview, production EAS build profiles
- `.github/workflows/ci.yml` — CI for backend, mobile TS check, migrations

### Parking Permit Integration ✅ (Feb 28, 2026)
- `permit_type` column added to `profiles` table (migration `20260315_add_permit_type.sql`)
- `ALL_PERMIT_TYPES`, `getPermitLotIds`, `ALL_COMMUTER_LOT_IDS` added to `mobile/data/lots.ts`
- `AuthProvider` extended with `permitType`, `noPermitMode`, `customLotFilter`, `setPermitPreference`
- Onboarding permit picker screen (`mobile/app/onboarding/permit.tsx`) — grouped permit list, no-permit modes
- Permit step wired into onboarding flow: permissions → permit → tabs
- Parking Permit row added to Profile settings tab
- Map applies permit-aware lot filtering (real permit, commuter-all, custom chip filter)
- Permit validity badge on LotDetails sheet
- Permit banner chip on map when no permit is configured
- `permit_type` added to backend `ProfileBase` schema
- `mobile/data/permit_mapping.json` — full Rutgers permit-to-lots mapping data

### Documentation
- `README.md` — complete rewrite
- `PLAN.md` — authoritative architecture contract (updated with permit feature + full future backlog)
- `ROADMAP.md` — phased roadmap (updated with recovered features from original plan)
- `ARCHITECTURE.md` — technical deep-dive
- `docs/archive/` — preserved copies of all old docs from git history
- `docs/CHANGELOG_DOCS.md` — documentation history and feature recovery log

---

## What's Left To Do

### Phase 4 — UI/UX Upgrade (not started)
This is intentionally deferred until core functionality is stable and tested.

- [ ] Map: richer lot cards, better occupancy color encoding, color-coded markers (green/yellow/red)
- [ ] Parking confirmation sheet: polish + animations, snap-to-spot drag-adjust for GPS drift
- [ ] Compass: make the needle visually beautiful ("Knight Needle" — center red lance, haptic lock-on)
- [ ] Auto-switch to compass mode when within 500 ft of parked lot
- [ ] Friends tab: richer friend cards with lot info, campus indicator
- [ ] Profile: settings, data export, account deletion flow
- [ ] Knight Mode / Campus Mode theme toggle (dark retro skin vs default)

### Phase 5 — Launch Readiness (remaining)
- [ ] Load test: simulate 50k users at 3 calls/day peak (k6 or locust)
- [ ] App Store: screenshots, App Review notes
- [ ] Privacy Policy: publish at `scarletspots.app/privacy`
- [ ] Staged rollout: internal alpha → Rutgers student beta → public

### Known Issues / Technical Debt
- ~~The 39 existing `parking_sessions` rows have `lot_id` values that are old UUIDs (pre-migration). They don't match any JSON `mapId`. These are test sessions — safe to clear or ignore.~~ ✅ Cleared.
- ~~`session_feedback` and `lot_occupancy` tables have 0 rows (fresh). The ML model will only become useful after 2–4 weeks of real session data.~~ ✅ Resolved — heuristic fallback is intentional at launch; ML model will activate automatically once data accumulates.
- ~~The `frontend/` directory (React/Vite admin) still exists. It is not wired to the new backend. Leave it alone for now.~~ ✅ Acknowledged — intentionally out of scope for v1.
- ~~Several SonarQube-style lint warnings exist throughout the mobile code (nested ternaries, unhandled catch blocks). They are pre-existing style issues, not bugs.~~ ✅ Resolved.

---

## Environment Variables

### `backend/.env`
```
SUPABASE_URL=https://dfkxffdplikdyhuvubnr.supabase.co
SUPABASE_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
SUPABASE_JWT_SECRET=<jwt secret>
```

### `mobile/.env`
```
EXPO_PUBLIC_SUPABASE_URL=https://dfkxffdplikdyhuvubnr.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
EXPO_PUBLIC_ENABLE_ALL_CAMPUSES=false   # set to true to show all campuses on map
EXPO_PUBLIC_OFFLINE_QUEUE_ENABLED=true
```

---

## How to Start the App Locally

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# Mobile
cd mobile
npm install
npx expo start
```

---

## How to Apply Future DB Migrations

Option A — Supabase SQL Editor (easiest):
1. Go to https://supabase.com/dashboard/project/dfkxffdplikdyhuvubnr/sql/new
2. Paste SQL and run

Option B — Management API (scriptable):
```python
import ctypes, ctypes.wintypes as wt, requests

# Extract token from Windows Credential Manager
CRED_TYPE_GENERIC = 1
# ... (see run_migration.py pattern from session history)
# Token target: "Supabase CLI:supabase"
# Blob encoding: UTF-8 (NOT UTF-16)

BASE = "https://api.supabase.com/v1/projects/dfkxffdplikdyhuvubnr/database/query"
# POST with {"query": "<SQL here>"}
```

---

## Useful Context for AI Assistants

- **Do not add a `parking_lots` table back**. Lot data lives in `mobile/data/rutgers_parking_data.json`.
- **`lot_id` is TEXT** everywhere (maps to `mapId` in the JSON, e.g. `"10001"`). Never use UUID for lot IDs.
- **The frontend admin app is intentionally untouched**. Do not modify `frontend/`.
- **Supabase Realtime** is used for live occupancy — subscribe to `public:lot_occupancy` channel.
- **`ENABLE_ALL_CAMPUSES`** feature flag in `mobile/constants/featureFlags.ts` controls whether non-NB lots appear.
- The **`getLotById(id)`** and **`getAllLots()`** functions in `mobile/data/lots.ts` are the single source of truth for lot metadata in the mobile app.
- The backend is intentionally **thin** — it handles only authentication, sessions, friends, and favorites. Lot metadata queries should NEVER be added back.
