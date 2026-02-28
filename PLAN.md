# ScarletSpots — Product & Architecture Contract

> This document is the authoritative source of truth for what ScarletSpots is, how it works, and what decisions have been made. It replaces all previous planning documents.

---

## The Core Insight

We have `rutgers_parking_data.json` — 245 lots, 1.4 MB, every lot has exact coordinates, GeoJSON polygons, capacity breakdown, photos, and campus. **Parking lot locations don't change.**

We were storing this static data in a PostgreSQL database and hitting it on every map load. That was wrong.

**New principle:** Static data lives in the app. Dynamic data lives in the database. The database only knows things that change.

---

## What ScarletSpots Is

A mobile app for Rutgers students to:
1. See which parking lots have space right now
2. Start a parking session when they park (crowd-sources occupancy)
3. Find their car later (compass bearing + distance to the lot)
4. Check if friends are parked on campus

That's it. Simple. Fast. Free to run.

---

## Architecture

```
Mobile App
├── rutgers_parking_data.json  (bundled, 1.4 MB, zero API calls for lot data)
│   └── used for: map display, geofencing, compass target, capacity, photos
└── Supabase Realtime subscription  (occupancy count updates only)

FastAPI Backend  (thin — only handles what's truly dynamic)
├── /users     → auth, profile, password reset
├── /park      → session start/end/active, detection feedback
├── /friends   → friend lifecycle + their parking lot (in Friends tab)
├── /favorites → add/remove/list (lot_id refs the JSON mapId)
└── /lots      → occupancy aggregate, forecasting

Database (Supabase, 5 tables)
├── profiles
├── parking_sessions        ← lot_id is TEXT (JSON mapId e.g. "10001")
├── lot_occupancy           ← (lot_id TEXT, count INT) updated atomically
├── friendships
└── user_favorites
```

### What was removed from the database

- `parking_lots` table — replaced by bundled JSON
- `occupancy_logs` table — replaced by `lot_occupancy` + sessions
- `event_logs` / `friend_sharing_settings` — simplified away
- PostGIS extension — polygon checks are client-side from JSON
- All spatial migrations and indexes

### API call math at 50k users

- Load lot data: **0 calls** (bundled)
- Typical user parks + leaves: **2 write calls/day**
- Occupancy updates: **0 polling** (Supabase Realtime push)
- Friends check: **1 read on tab open**
- Total: ~3–4 calls/day per user → well within Supabase free tier

---

## Feature Decisions

### In for v1

- **Auth**: email + password, Rutgers domain enforced (`@rutgers.edu`, `@scarletmail.rutgers.edu`)
- **Map**: All NB lots from bundled JSON with live occupancy overlay. Other campuses behind `ENABLE_ALL_CAMPUSES` feature flag.
- **Parking session**: Start (confirmation sheet), active state, end session
- **Session chip**: Subtle floating pill above tab bar showing "Lot X • Find Car | End" — not an intrusive full-width banner
- **Compass (Navigate tab)**: Bearing + distance to parked lot's coordinates from JSON. No proximity state machine, no haptic lock-on. Simple and reliable.
- **Friends**: Send/accept/block. See which lot a friend is parked at in the Friends tab. No friend markers on the map.
- **Favorites**: Save/remove lots (lot_id references JSON mapId)
- **Offline**: Map always loads (data is local). Session actions queue to OfflineQueue and replay on reconnect.
- **Forecasting**: Heuristic model for launch, ML model once session data accumulates (2–4 weeks)
- **Parking Permit**: Onboarding permit picker + profile settings row. Permit type stored in `profiles.permit_type`. Permit-aware lot filtering on map. Permit validity badge on LotDetails. Supports no-permit modes (commuter-all, custom chip filter).

### Out for v1 (documented as future)

- Web admin frontend (completely removed — plan as v2 admin portal with geofence editor, live heatmap, user management)
- Friend location markers on map (friends tab only for v1)
- Push notifications ("lot almost full" / "friend parked nearby")
- Google OAuth
- Account deletion flow (placeholder in profile)
- Notification preferences screen
- Heat map overlays (per-zone density visualization)
- Virtual Grid Park Flow (accelerometer-based spot suggestion)
- Bluetooth-assisted parking detection
- Common Commuter Spots database (pre-mapped Rutgers buildings for destination suggestions)
- Navigation hand-off to Google Maps / Apple Maps
- Knight Mode / Campus Mode theme toggle (retro dark skin vs default)
- ScarletSpots Premium: ticket reporting + enforcement analytics (post-launch, monetization)

### Changed from original

| Feature | Before | After |
|---------|--------|-------|
| Active session indicator | Full-width intrusive banner at top | Subtle floating chip above tab bar |
| Compass | Magnetometer + GPS + proximity states + haptic lock-on | Bearing arrow + distance text only |
| Friends | See friends on map + friends tab | Friends tab only (which lot, not coordinates) |
| Lot data source | PostgreSQL database via API | Bundled JSON, zero API calls |
| Realtime updates | Poll `parking_lots` table every 5 min | Push subscription on `lot_occupancy` table |
| Geofencing | Loaded polygons from API | Loaded from bundled JSON |
| Permit filtering | Not planned for v1 | Added — permit-aware lot filtering + onboarding picker |

---

## Data Flow

### App startup
1. Module loads `rutgers_parking_data.json` → builds `NB_LOTS` array
2. Supabase query: `SELECT lot_id, count FROM lot_occupancy` (one small query)
3. `applyOccupancy(lots, occupancyMap)` merges live counts into the static array
4. Realtime subscription on `lot_occupancy` — UI updates instantly on any change

### Park start
1. User taps "Park Here" on a lot
2. `POST /park/session {lotId, spotNumber, lat, lng}`
3. Backend calls `increment_lot_occupancy(lot_id)` RPC → `lot_occupancy.count++`
4. Supabase Realtime pushes the change to all subscribed clients
5. Mobile updates optimistically, anchors to `confirmedOccupancy` from response

### Park end
1. User taps "End" on the session chip
2. `POST /park/session/end`
3. Backend calls `decrement_lot_occupancy(lot_id)` RPC → `lot_occupancy.count--`
4. Realtime push propagates to all clients

### Compass
1. User opens Navigate tab
2. `GET /park/session/active` → returns `{lotId}`
3. `getLotById(lotId)` → from bundled JSON → `{latitude, longitude}`
4. GPS position + bearing formula → animated needle + distance text

---

## Non-Functional Requirements

- **Cost**: Supabase free tier supports ~50k users at this call volume
- **Reliability**: App must not crash. Known crash causes addressed: removed periodic location broadcast loop, fixed Realtime subscription cleanup on unmount
- **Offline**: Map loads offline (local data). Actions queue and replay.
- **Auth only**: `@rutgers.edu` and `@scarletmail.rutgers.edu` emails only
- **No Redis**: Not needed at this scale with static lot data
- **No background workers**: No batch jobs required with static lot data
- **No PostGIS**: Client-side polygon checks from JSON are sufficient
