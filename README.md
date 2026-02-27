# ScarletSpots

> Real-time parking availability for Rutgers University — crowd-sourced, offline-first, built for students.

---

## What It Is

ScarletSpots is a mobile app (iOS + Android) that shows live parking occupancy for all Rutgers lots. Students start a parking session when they park; the count goes up. When they leave, it goes down. Everyone sees live availability without a backend that costs a fortune.

**Key architectural insight:** Rutgers lot data (245 lots, polygons, capacity, photos) is **bundled directly in the app**. It never expires, it never requires an API call, and it works offline. Only the live occupancy count (`how many cars are parked right now`) lives in the database.

---

## Repository Structure

```
ScarletSpots/
├── mobile/          # Expo (React Native) — the real app
├── backend/         # FastAPI (Python) — thin API layer
└── frontend/        # Deprecated — see docs/ROADMAP.md
```

---

## Mobile App

Built with **Expo** (managed + bare hybrid), **TypeScript**, `react-native-maps`, and Supabase for auth + realtime.

### Running locally

```bash
cd mobile
npm install
cp .env.example .env  # Fill in Supabase keys
npx expo start
```

Environment variables needed (`.env`):
```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_API_URL=http://localhost:8001/api/v1
```

### Key files

| File | Purpose |
|------|---------|
| `mobile/data/lots.ts` | Typed wrapper for bundled lot JSON — the single source of truth for lot metadata |
| `mobile/data/rutgers_parking_data.json` | 245 Rutgers lots with coordinates, polygons, capacity, photos |
| `mobile/app/(tabs)/index.tsx` | Map screen — occupancy overlay, session chip, lot details |
| `mobile/app/(tabs)/navigate.tsx` | Compass screen — bearing + distance to parked lot |
| `mobile/app/(tabs)/friends.tsx` | Friends screen — see which lot friends are parked at |
| `mobile/services/ParkingDetectionService.ts` | Auto-detection pipeline |
| `mobile/services/OfflineQueue.ts` | Queues park/end actions when offline |

---

## Backend

**FastAPI** (Python 3.11) with Supabase as the database. The backend is intentionally thin — it only handles things that must be server-authoritative.

### Running locally

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env  # Fill in Supabase keys
uvicorn app.main:app --reload --port 8001
```

### API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/users/signup` | Public | Create Rutgers-email account |
| POST | `/api/v1/users/password-reset` | Public | Send password reset email |
| GET | `/api/v1/users/me` | Required | Get own profile |
| PATCH | `/api/v1/users/me` | Required | Update profile |
| POST | `/api/v1/park/session` | Required | Start parking session |
| POST | `/api/v1/park/session/end` | Required | End parking session |
| GET | `/api/v1/park/session/active` | Required | Get active session |
| POST | `/api/v1/park/session/feedback` | Required | Submit detection quality feedback |
| GET | `/api/v1/lots/occupancy` | Public | Get occupancy counts for all lots |
| GET | `/api/v1/lots/{lot_id}/forecast` | Public | Get occupancy forecast |
| GET | `/api/v1/friends` | Required | List friends and requests |
| POST | `/api/v1/friends/request` | Required | Send friend request |
| POST | `/api/v1/friends/accept` | Required | Accept request |
| POST | `/api/v1/friends/decline` | Required | Decline request |
| POST | `/api/v1/friends/block` | Required | Block user |
| GET | `/api/v1/favorites` | Required | List favorite lots |
| POST | `/api/v1/favorites/{lot_id}` | Required | Add favorite |
| DELETE | `/api/v1/favorites/{lot_id}` | Required | Remove favorite |

---

## Database (Supabase)

5 tables. That's it.

| Table | Purpose |
|-------|---------|
| `profiles` | User profile (name, email, avatar) |
| `parking_sessions` | Active + historical sessions. `lot_id` is the JSON `mapId` string |
| `lot_occupancy` | Live count per lot `(lot_id TEXT, count INT)` — updated atomically via RPC |
| `friendships` | Friend relationships (pending / accepted / blocked) |
| `user_favorites` | Saved lots per user |

### Running migrations

```bash
# Apply all migrations in order
supabase db push
# Or run individual migration file against the DB
psql $DATABASE_URL -f backend/supabase/migrations/20260310_pivot_static_lots.sql
```

---

## Architecture at a Glance

```
Mobile App
├── rutgers_parking_data.json  (bundled, 1.4 MB — zero API calls for lot data)
│   └── lot names, polygons, capacity, photos, campus
└── Supabase Realtime  (live occupancy push)
    └── lot_occupancy table changes

FastAPI Backend  (handles only dynamic data)
├── Auth + profiles
├── Parking sessions (start / end / active)
├── Occupancy RPCs (atomic increment / decrement)
├── Friends
├── Favorites
└── Forecasting (heuristic → ML once data accumulates)

Supabase (PostgreSQL)
└── 5 tables (profiles, sessions, lot_occupancy, friendships, favorites)
```

**API call budget (50k users):**
- Load lot data: **0 calls** (bundled in app)
- Typical park + leave: **2 write calls/day**
- Occupancy updates: **0 polling** (Supabase Realtime push)
- Friends check: **1 read on tab open**
- Total: ~3–4 calls/day per user — well within Supabase free tier

---

## Authentication

Email + password only. Restricted to `@rutgers.edu` and `@scarletmail.rutgers.edu`.

---

## Environment Variables

### Mobile (`mobile/.env`)
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_API_URL=
EXPO_PUBLIC_ENABLE_ALL_CAMPUSES=false   # true to show all Rutgers campuses
```

### Backend (`backend/.env`)
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
```

---

## Current Status

See [ROADMAP.md](ROADMAP.md) for the phased plan.

Core features are functional:
- Map with live occupancy overlay
- Parking session start / end
- Auto-detection pipeline
- Compass to parked car
- Friends (which lot they're at, in Friends tab)
- Offline action queue

In progress:
- ML forecast model (launches with heuristic, trains once session data accumulates)
- CI/CD pipeline
