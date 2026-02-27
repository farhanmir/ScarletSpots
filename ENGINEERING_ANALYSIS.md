# ScarletSpots — Principal Engineer Analysis & Traycer Planning Document
> Generated: 2026-02-25 | Updated: 2026-02-27 | Scope: Full repository audit for 10× scale production readiness

---

## PART 1: ARCHITECTURE SUMMARY

### System Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│  ┌──────────────────────┐    ┌──────────────────────────────┐  │
│  │  Expo React Native    │    │  React Web (frontend/)       │  │
│  │  (mobile/)           │    │  - Admin panel               │  │
│  │  - Map (RN Maps)     │    │  - Vite + TypeScript         │  │
│  │  - Auth (Supabase)   │    │  - Thin, mostly placeholder  │  │
│  │  - Detection pipeline│    └──────────────────────────────┘  │
│  │  - Offline cache     │                                       │
│  └──────────┬───────────┘                                       │
└─────────────┼───────────────────────────────────────────────────┘
              │ REST (axios / fetch)
              │
┌─────────────▼───────────────────────────────────────────────────┐
│                     API LAYER (backend/)                        │
│  FastAPI 0.115 / Python / Uvicorn                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Routers:                                                │   │
│  │  /users   /lots   /friends   /park/session               │   │
│  │  /compass   /admin                                       │   │
│  │                                                          │   │
│  │  Middleware: CORS, CorrelationID, Rate-Limit (slowapi)   │   │
│  └──────────────────────┬───────────────────────────────────┘   │
└─────────────────────────┼───────────────────────────────────────┘
                          │ supabase-py SDK
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                     DATA LAYER                                  │
│  ┌──────────────────────┐    ┌──────────────────────────────┐  │
│  │  Supabase (Postgres) │    │  Supabase Auth               │  │
│  │  - profiles          │    │  - JWT (HS256)               │  │
│  │  - parking_lots      │    │  - admin.create_user()       │  │
│  │  - occupancy_logs    │    └──────────────────────────────┘  │
│  │  - friendships       │                                       │
│  │  - parking_sessions* │    * Not in migration yet            │
│  │  - event_logs*       │                                       │
│  │  - friend_sharing*   │                                       │
│  └──────────────────────┘                                       │
│                                                                  │
│  Redis: NOT IMPLEMENTED (planned in PLAN.md)                    │
│  PostGIS: NOT ENABLED (create extension commented out)          │
│  Background Workers: NOT IMPLEMENTED (planned)                  │
└─────────────────────────────────────────────────────────────────┘
```

### Module Inventory

| Layer | Module | Status |
|-------|--------|--------|
| Backend | `routers/users.py` | ✅ Functional — signup + typed ProfileUpdate CRUD |
| Backend | `routers/lots.py` | ✅ Functional — CRUD + ForecastProvider interface + admin guards |
| Backend | `routers/park.py` | ✅ Refactored — single path via `parking_sessions`, atomic occupancy RPC |
| Backend | `routers/friends.py` | ✅ Fixed — audit log bug resolved, sharing toggle correct |
| Backend | `routers/compass.py` | ✅ Refactored — reads directly from `parking_sessions` |
| Backend | `routers/admin.py` | ✅ Protected — `require_admin` dependency enforced |
| Backend | `services/forecasting.py` | Heuristic placeholder — behind `ForecastProvider` interface for ML swap |
| Backend | `core/security.py` | ✅ Pooled — shared clients on `app.state`, per-request auth context clone |
| Backend | `core/limiter.py` | Wired — applied to key mutating endpoints; global middleware not yet done |
| Mobile | `services/ParkingDetectionService.ts` | Well-structured — unit-testable |
| Mobile | `services/GeofenceManager.ts` | ✅ Fixed — imports `PARKING_DETECTION_TASK` from `BackgroundTasks.ts` |
| Mobile | `services/BackgroundTasks.ts` | Functional — 0.8 confidence hardcoded (feature flag deferred) |
| Mobile | `services/OfflineCache.ts` | ✅ Functional — offline queuing with `OfflineQueue.ts` |
| Mobile | `lib/supabase.ts` | ✅ Refactored — single FastAPI path via `api-base.ts`; dual-routing removed |
| Mobile | `context/AuthProvider.tsx` | Clean |
| Mobile | `components/LotDetails.tsx` | Large component — decomposition deferred |
| DB | `migrations/20260215_init_schema.sql` | Base schema |
| DB | `migrations/20260220_friends_schema.sql` | Friends schema |
| DB | `migrations/20260301_parking_sessions_schema.sql` | ✅ Added — `parking_sessions` table with RLS + index |
| DB | `migrations/20260301_missing_columns_schema.sql` | ✅ Added — coordinates, is_custom, full_name, event_logs, friend_sharing_settings |
| DB | `migrations/20260302_performance_indexes.sql` | ✅ Added — spatial and query performance indexes |
| DB | `migrations/20260305_atomic_occupancy_rpcs.sql` | ✅ Added — `increment_lot_occupancy` / `decrement_lot_occupancy` RPCs |

---

## PART 2: TECHNICAL DEBT REPORT

### CRITICAL (Must fix before any production traffic)

#### ~~TD-01: Admin endpoints have zero authorization~~ ✅ RESOLVED
**File:** `backend/app/core/security.py`, `backend/app/routers/admin.py`
`require_admin` dependency implemented — checks `profiles.role == 'admin'` and raises HTTP 403 if not admin. Applied to all admin routes and lot mutation endpoints (`/lots/init`, `/lots/custom` CRUD).

---

#### ~~TD-02: Missing database migrations for actively-used tables~~ ✅ RESOLVED
Migrations added:
- `20260301_parking_sessions_schema.sql` — `parking_sessions` table with RLS + `(user_id, active)` index
- `20260301_missing_columns_schema.sql` — `coordinates`, `is_custom`, `full_name` generated column, `event_logs`, `friend_sharing_settings`
- `20260220_friends_schema.sql` updated — `sharing_enabled` column present

---

#### ~~TD-03: Copy-paste bug in sharing audit log~~ ✅ RESOLVED
**File:** `backend/app/routers/friends.py`
Fixed: `"sharing_enabled" if body.enabled else "sharing_disabled"` — both branches now distinct.

---

#### ~~TD-04: `POST /lots/init` is unauthenticated~~ ✅ RESOLVED
**File:** `backend/app/routers/lots.py`
`require_admin` dependency added to `init_lots()`.

---

#### ~~TD-05: `PATCH /users/me` accepts arbitrary dict~~ ✅ RESOLVED
**File:** `backend/app/routers/users.py`
Replaced `body: dict` with `body: ProfileUpdate` Pydantic model with `extra='forbid'`. Only `first_name`, `last_name`, `avatar_url` can be updated via this endpoint.

---

### HIGH (Must fix before beta)

#### ~~TD-06: Dual-write / dual-read fallback anti-pattern~~ ✅ RESOLVED
**Files:** `park.py`, `compass.py`
Removed all fallback branches. `parking_sessions` is now the sole authoritative data store. Occupancy is updated via atomic SQL RPCs (`increment_lot_occupancy` / `decrement_lot_occupancy`).

---

#### TD-07: Rate limiting is applied to only one of six routers
**File:** `backend/app/core/limiter.py`
Rate limiter is applied to key mutating endpoints (`/users/signup`, `/park/session`, `/admin/*`). Global middleware rate limiting not yet applied to all endpoints.
**Status:** Partially addressed. Remaining: apply to all mutating endpoints or use global middleware.

---

#### ~~TD-08: `get_auth_db` allocates a new Supabase client per request~~ ✅ RESOLVED
**File:** `backend/app/core/security.py`
`get_auth_db` now returns an `AuthContextClient` that clones the per-request PostgrestClient from the shared base — no new SDK client instantiation per request.

---

#### ~~TD-09: Global Supabase singleton is not process-safe~~ ✅ RESOLVED
**File:** `backend/app/core/security.py`, `backend/app/main.py`
Clients initialized once in the FastAPI `lifespan` event and stored on `app.state`. No module-level globals.

---

#### ~~TD-10: `FASTAPI_ROUTES` hardcoded prefix list in mobile client~~ ✅ RESOLVED
**File:** `mobile/lib/supabase.ts`, `mobile/lib/api-base.ts`
Dual-routing table removed. All API calls now route through a single `fetchBackend` helper with explicit base URL config.

---

#### ~~TD-11: `profiles` schema mismatch — `full_name` vs `first_name`/`last_name`~~ ✅ RESOLVED
**Migration:** `20260301_missing_columns_schema.sql`
Added `full_name` as a generated column: `COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')`.

---

#### TD-12: `LotDetails.tsx` is 563 lines — single-responsibility violation
Contains forecast fetching, chart rendering, occupancy color logic, navigation link generation, parking session submission, and full bottom-sheet layout in one file.
**Status:** Outstanding — deferred to Phase 2 UX work.

---

### MEDIUM (Technical health, pre-scale)

#### ~~TD-13: Forecast service uses `random` with deterministic seed~~ ✅ RESOLVED
**File:** `backend/app/services/forecast_provider.py`, `backend/app/services/forecasting.py`
`ForecastProvider` abstract interface introduced. `HeuristicForecastProvider` implements the heuristic. Real ML model can be substituted without touching router code.

---

#### ~~TD-14: `occupancy_level: 100` hardcoded on park session start~~ ✅ RESOLVED
**File:** `backend/app/routers/park.py`
Uses `increment_lot_occupancy` / `decrement_lot_occupancy` SQL RPCs (added in `20260305_atomic_occupancy_rpcs.sql`). Computed occupancy percentage written to `occupancy_logs`.

---

#### ~~TD-15: No pagination on any list endpoints~~ ✅ RESOLVED
`GET /lots`, `GET /admin/users`, and all collection endpoints now accept `limit`/`offset` parameters with server-side clamping (max 200).

---

#### ~~TD-16: `GeofenceManager.ts` starts `ACTIVE_TRACKING_TASK` but also stops it~~ ✅ RESOLVED
**File:** `mobile/services/GeofenceManager.ts`
Now imports `PARKING_DETECTION_TASK` from `BackgroundTasks.ts`. Local string definition removed.

---

#### ~~TD-17: Internal error details exposed to clients~~ ✅ RESOLVED
**File:** `backend/app/main.py`
Global `generic_exception_handler` logs full stack traces with correlation ID server-side and returns a sanitized `{"detail": "An internal error occurred."}` response to clients.

---

#### TD-18: `slowapi` rate limiter uses IP-based keying
Users behind campus NAT (Rutgers eduroam) share an IP. A single heavy user will throttle all peers on the same NAT.
**Status:** Outstanding — user-ID-based `key_func` not yet implemented.

---

#### ~~TD-19: No database indexes defined in migrations~~ ✅ RESOLVED
`20260302_performance_indexes.sql` adds indexes for:
- `occupancy_logs (reporter_id, status)`
- `friendships (user_id, status)`, `friendships (friend_id, status)`
- `parking_sessions (user_id, active)`
- `parking_lots (campus)`

---

#### TD-20: Tests only verify authentication barriers
All existing tests check that unauthenticated requests are rejected. There are zero tests for:
- Actual business logic (friend accept/decline flow)
- Forecast computation correctness
- Custom geofence CRUD lifecycle
- Admin stats computation
- Schema validation (Pydantic model guards)
**Status:** Outstanding — business logic test coverage remains low.

---

### LOW (Long-term maintainability)

- ~~**TD-21:** `ForecastingService` import placed at bottom of `lots.py` after router definition~~ ✅ Fixed — imports moved to top of file
- **TD-22:** No Pydantic schemas for occupancy reporting body (`body: dict` in `report_occupancy`)
- ~~**TD-23:** `parking_lots` table uses `isCustom` (camelCase) as a column name~~ ✅ Fixed — migration adds `is_custom` (snake_case)
- **TD-24:** Web `frontend/` is underdeveloped relative to mobile — no shared component library or design system
- ~~**TD-25:** No `.env.example` file exists in `backend/`~~ ✅ Fixed — `backend/.env.example` added
- ~~**TD-26:** `users.py` signup returns raw Supabase user object~~ ✅ Fixed — returns typed `SignupResponse`
- **TD-27:** Background confidence threshold `0.8` is hardcoded in `BackgroundTasks.ts` — should be a feature flag

---

## PART 3: STRATEGIC ROADMAP

### Prioritization Matrix

| Item | Impact | Status | Effort |
|------|--------|--------|--------|
| TD-01 Admin auth | CRITICAL | ✅ Resolved | XS |
| TD-02 Missing migrations | CRITICAL | ✅ Resolved | S |
| TD-03 Audit bug | HIGH | ✅ Resolved | XS |
| TD-04 Unauth init endpoint | HIGH | ✅ Resolved | XS |
| TD-05 Arbitrary profile update | HIGH | ✅ Resolved | XS |
| TD-06 Dual-write pattern | HIGH | ✅ Resolved | M |
| TD-07 Rate limit gaps | HIGH | Partially resolved | S |
| TD-08 Per-request client | HIGH | ✅ Resolved | M |
| TD-09 Non-process-safe singleton | HIGH | ✅ Resolved | S |
| TD-10 FASTAPI_ROUTES hardcoded | HIGH | ✅ Resolved | S |
| TD-11 Schema mismatch | HIGH | ✅ Resolved | S |
| TD-13 Forecast interface | MEDIUM | ✅ Resolved | M |
| TD-14 Occupancy=100 bug | HIGH | ✅ Resolved | S |
| TD-15 No pagination | MEDIUM | ✅ Resolved | M |
| TD-16 Task name coupling | MEDIUM | ✅ Resolved | XS |
| TD-17 Error detail exposure | MEDIUM | ✅ Resolved | XS |
| TD-19 No DB indexes | MEDIUM | ✅ Resolved | S |
| TD-18 Rate limiter IP keying | MEDIUM | Outstanding | S |
| TD-12 LotDetails.tsx size | LOW | Outstanding | M |
| TD-20 Test coverage | LOW | Outstanding | L |

### Phase Structure

```
Phase 0 — Stabilize (2 weeks)      ✅ COMPLETE
  Fix all CRITICAL and HIGH items
  Land missing migrations
  Enforce admin RBAC
  
Phase 1 — Platform Hardening (4 weeks)  ← CURRENT
  Redis integration (caching + rate limit storage)
  PostGIS spatial indexes
  User-ID-based rate limiting (TD-18)
  Observability (structured logging already started)
  
Phase 2 — Detection System (5 weeks)
  Geofence state machine hardened
  Confidence threshold via feature flags
  
Phase 3 — Social + Privacy (3 weeks)
  Full friend lifecycle with audit
  Per-friend sharing enforcement
  
Phase 4 — Intelligence Layer (6 weeks)
  ForecastProvider interface
  Real ML model behind abstraction
  Drift monitoring
  
Phase 5 — Scale + Launch (4 weeks)
  Load tests / soak tests
  Staged rollout
  App store prep
```

---

## PART 4: TRAYCER-ORIENTED STRUCTURED PLANNING PROMPTS

---

### EPIC E-01: Critical Security Hardening

**Priority:** P0 — Block all other work  
**Owner domain:** Backend  
**Dependency:** None

---

#### Phase E-01-A: Admin RBAC

**Ticket T-01-A-01: Implement `require_admin` dependency**

```
CONTEXT:
  File: backend/app/core/security.py
  File: backend/app/routers/admin.py

TASK:
  Create a FastAPI Depends()-compatible function `require_admin(current_user=Depends(get_current_user))`
  that fetches the user's profile from the `profiles` table and verifies `role == 'admin'`.
  Raise HTTP 403 Forbidden if not admin.
  Apply this dependency to ALL routes in admin.py.

ACCEPTANCE CRITERIA:
  - GET /admin/stats with a non-admin JWT returns 403
  - GET /admin/stats with an admin JWT returns 200
  - GET /admin/users with any non-admin token returns 403
  - Unit test covers both cases using mock Supabase responses
  - The dependency is reusable across future admin routers

CONSTRAINTS:
  - Do NOT change the profiles schema — `role` column already exists in migration
  - Use the existing `get_current_user` and `get_supabase` patterns
  - Do not hardcode user IDs or emails as admin

VERIFICATION:
  Run: pytest backend/tests/test_admin.py
```

---

**Ticket T-01-A-02: Protect `/lots/init` and `/lots/custom` with admin check**

```
CONTEXT:
  File: backend/app/routers/lots.py
  Functions: init_lots(), create_custom_geofence(), update_custom_geofence(), delete_custom_geofence()

TASK:
  - Add `require_admin` dependency to init_lots()
  - Add `require_admin` dependency to create_custom_geofence(), update_custom_geofence(),
    delete_custom_geofence()
  - Remove comment "# In a real production app, check role" and replace with actual enforcement

ACCEPTANCE CRITERIA:
  - Unauthenticated POST /lots/init returns 403
  - Authenticated non-admin POST /lots/init returns 403
  - Authenticated admin POST /lots/init returns expected response
  - Custom geofence CRUD returns 403 to non-admins

CONSTRAINTS:
  - Preserve existing endpoint signatures and response shapes
  - Do not break existing lots GET endpoints (public, no auth required)
```

---

**Ticket T-01-A-03: Fix arbitrary profile update vulnerability**

```
CONTEXT:
  File: backend/app/routers/users.py — PATCH /me
  File: backend/app/schemas/user.py

TASK:
  Replace `body: dict` in update_user_me() with `body: ProfileUpdate`.
  ProfileUpdate schema already exists in user.py (first_name, last_name, avatar_url).
  Ensure no other fields (role, id, email, created_at) can be updated via this endpoint.

ACCEPTANCE CRITERIA:
  - PATCH /me with {"role": "admin"} returns 422 Unprocessable Entity
  - PATCH /me with {"first_name": "Test"} returns 200 and updates the field
  - Schema rejects unknown fields (use model_config extra='forbid')

CONSTRAINTS:
  - Use Pydantic v2 `model_config = ConfigDict(extra='forbid')`
  - Do not add new database columns
```

---

#### Phase E-01-B: Missing Migrations

**Ticket T-01-B-01: Write migration 20260301_parking_sessions_schema.sql**

```
CONTEXT:
  File: backend/supabase/migrations/ (new file)
  Referenced by: backend/app/routers/park.py, backend/app/routers/compass.py

TASK:
  Create migration file with the following table:

  CREATE TABLE public.parking_sessions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id) NOT NULL,
    lot_id uuid REFERENCES public.parking_lots(id) NOT NULL,
    spot_number text,
    latitude float,
    longitude float,
    active boolean DEFAULT true,
    start_time timestamptz DEFAULT timezone('utc', now()) NOT NULL,
    end_time timestamptz,
    created_at timestamptz DEFAULT timezone('utc', now()) NOT NULL
  );

  Add RLS: users can only see/write their own sessions.
  Add index: (user_id, active).

ACCEPTANCE CRITERIA:
  - Migration applies cleanly to a fresh Supabase instance
  - RLS prevents cross-user session reads
  - Index (user_id, active) exists in information_schema

CONSTRAINTS:
  - Do NOT use PostGIS extensions in this migration (not yet enabled)
  - Follow naming convention: snake_case columns
  - Include rollback notes as SQL comments
```

---

**Ticket T-01-B-02: Write migration 20260301_missing_columns_schema.sql**

```
CONTEXT:
  Missing columns and tables identified in TD-02, TD-11, TD-23

TASK:
  Add to migration:
  1. ALTER TABLE public.parking_lots ADD COLUMN IF NOT EXISTS coordinates jsonb;
  2. ALTER TABLE public.parking_lots ADD COLUMN IF NOT EXISTS is_custom boolean DEFAULT false;
     (rename isCustom -> is_custom to follow SQL convention)
  3. ALTER TABLE public.parking_lots ADD COLUMN IF NOT EXISTS full_name text GENERATED ALWAYS AS
     (COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) STORED
     in public.profiles table.
  4. ALTER TABLE public.friendships ADD COLUMN IF NOT EXISTS sharing_enabled boolean DEFAULT true;
  5. CREATE TABLE public.event_logs (
       id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
       user_id uuid REFERENCES public.profiles(id),
       target_id uuid,
       action text,
       entity_type text,
       created_at timestamptz DEFAULT timezone('utc', now())
     );
  6. CREATE TABLE public.friend_sharing_settings (
       user_id uuid REFERENCES public.profiles(id),
       friend_id uuid REFERENCES public.profiles(id),
       sharing_enabled boolean DEFAULT true,
       updated_at timestamptz DEFAULT timezone('utc', now()),
       PRIMARY KEY (user_id, friend_id)
     );

ACCEPTANCE CRITERIA:
  - All tables and columns referenced in application code now exist
  - friends.py `get_friends()` returns users with populated names (not "Unknown")
  - sharing toggle persists to friend_sharing_settings
  - event_logs audit entries write without exception

CONSTRAINTS:
  - Apply after T-01-B-01 (depends on parking_sessions)
  - Update all application code that references `isCustom` → `is_custom`
```

---

**Ticket T-01-B-03: Fix copy-paste bug in sharing audit log**

```
CONTEXT:
  File: backend/app/routers/friends.py
  Function: toggle_sharing() — line with _log_sharing_event call

TASK:
  Fix the ternary expression:
  BEFORE: "sharing_enabled" if body.enabled else "sharing_enabled"
  AFTER:  "sharing_enabled" if body.enabled else "sharing_disabled"

ACCEPTANCE CRITERIA:
  - event_logs.action == "sharing_disabled" when sharing is turned off
  - event_logs.action == "sharing_enabled" when sharing is turned on
  - Unit test asserts both branches produce the correct string

CONSTRAINTS:
  - One-line change only
  - Add regression test in tests/test_friends.py
```

---

**Ticket T-01-B-04: Fix hardcoded occupancy_level=100**

```
CONTEXT:
  File: backend/app/routers/park.py
  Function: start_parking_session() line 78

TASK:
  When inserting the occupancy_log entry during a park session start:
  1. Query the current lot from parking_lots (capacity, current_occupancy)
  2. Compute occupancy_percent = min(100, (current_occupancy + 1) / max(1, capacity) * 100)
  3. Write this computed value instead of hardcoded 100

ACCEPTANCE CRITERIA:
  - Lot with capacity=200 and current_occupancy=100 → occupancy_level=51 (not 100)
  - Lot with capacity=0 (unknown) → occupancy_level=0 (graceful fallback)
  - Unit test verifies computation logic

CONSTRAINTS:
  - Use a single additional DB fetch (don't add an N+1 if processing multiple sessions)
  - Handle the case where lot doesn't exist gracefully (log warning, default to 0)
```

---

### EPIC E-02: Data Layer Stabilization

**Priority:** P0 — Required before any persistence-dependent feature work  
**Dependency:** E-01-B (migrations)

---

**Ticket T-02-01: Remove dual-write fallback pattern from park.py**

```
CONTEXT:
  File: backend/app/routers/park.py
  Functions: start_parking_session(), end_parking_session(), get_active_session()

TASK:
  After T-01-B-01 lands the parking_sessions migration:
  1. Remove all try/except fallback blocks that fall back to occupancy_logs
  2. parking_sessions is the authoritative session store
  3. occupancy_logs remains for reporting purposes — write to it AS A SIDE EFFECT
     using post-commit logic, not as a fallback target
  4. Schema: start writes one row to parking_sessions AND one to occupancy_logs (status=open)
             end writes end_time to parking_sessions AND one new row to occupancy_logs (status=closed)

ACCEPTANCE CRITERIA:
  - start_parking_session inserts exactly one row in parking_sessions
  - start_parking_session inserts exactly one row in occupancy_logs (status=open)
  - end_parking_session sets parking_sessions.active=false, writes new occupancy_log (status=closed)
  - Removing fallback removes all bare `except: pass` blocks
  - GET /park/session/active reads ONLY from parking_sessions

CONSTRAINTS:
  - Do not change the response shape (mobile client depends on it)
  - Do not use raw try/except with pass to silence errors
  - Add proper error logging for each failure path
```

---

**Ticket T-02-02: Remove dual-read fallback from compass.py**

```
CONTEXT:
  File: backend/app/routers/compass.py

TASK:
  After T-02-01:
  1. Remove the try/except that falls back to occupancy_logs
  2. Query only parking_sessions for active sessions
  3. If no active session, return {"target": null}

ACCEPTANCE CRITERIA:
  - GET /compass reads only from parking_sessions
  - Returns correct lot data via JOIN (parking_lots)
  - Returns null target if no active session

CONSTRAINTS:
  - Maintain response shape for mobile Compass screen compatibility
```

---

**Ticket T-02-03: Add database indexes migration**

```
CONTEXT:
  File: backend/supabase/migrations/ (new file: 20260302_performance_indexes.sql)

TASK:
  CREATE INDEX CONCURRENTLY idx_parking_sessions_user_active
    ON parking_sessions(user_id, active) WHERE active = true;

  CREATE INDEX CONCURRENTLY idx_occupancy_logs_reporter_status
    ON occupancy_logs(reporter_id, status, created_at DESC);

  CREATE INDEX CONCURRENTLY idx_occupancy_logs_lot_created
    ON occupancy_logs(lot_id, created_at DESC);

  CREATE INDEX CONCURRENTLY idx_friendships_user_status
    ON friendships(user_id, status);

  CREATE INDEX CONCURRENTLY idx_friendships_friend_status
    ON friendships(friend_id, status);

  CREATE INDEX CONCURRENTLY idx_profiles_email
    ON profiles(email);

ACCEPTANCE CRITERIA:
  - EXPLAIN ANALYZE on GET /friends shows index scan, not seq scan
  - EXPLAIN ANALYZE on GET /park/session/active shows index scan
  - Migration applies without downtime (CONCURRENTLY)

CONSTRAINTS:
  - Use CONCURRENTLY to avoid table locks
  - Test against a populated staging DB, not empty test instance
```

---

**Ticket T-02-04: Add pagination to all collection endpoints**

```
CONTEXT:
  Files: backend/app/routers/lots.py, friends.py, admin.py

TASK:
  Add `limit: int = 50, offset: int = 0` query parameters to:
  - GET /lots/
  - GET /admin/users
  Apply to the Supabase query: .range(offset, offset + limit - 1)

  Add pagination metadata to response:
  { "data": [...], "total": N, "limit": 50, "offset": 0 }

ACCEPTANCE CRITERIA:
  - GET /lots?limit=10&offset=0 returns 10 lots
  - GET /lots?limit=10&offset=10 returns next 10 lots
  - GET /admin/users?limit=20 returns 20 users maximum
  - Total count is accurate (uses Supabase count="exact")

CONSTRAINTS:
  - Default limit must be 50, max limit 200 (validate and clamp)
  - Do not break existing mobile clients (backward compatible — current response 
    format is a plain list; wrap in envelope only on admin endpoints, 
    keep /lots/ as list for mobile compatibility)
```

---

### EPIC E-03: Backend Performance & Reliability

**Priority:** P1 — Before beta / load testing  
**Dependency:** E-01, E-02

---

**Ticket T-03-01: Implement Supabase client pooling via app lifespan**

```
CONTEXT:
  File: backend/app/core/security.py
  File: backend/app/main.py

TASK:
  1. Replace module-level lazy globals with FastAPI lifespan initialization:
     - On startup: instantiate _supabase and _admin_supabase, store on app.state
     - On shutdown: close any underlying HTTPX sessions if accessible
  2. Update get_supabase() and get_admin_supabase() to read from app.state
  3. For get_auth_db(): instead of creating a full new client per request,
     clone the base client's postgrest instance with per-request auth:
       db = get_supabase()
       db.postgrest.auth(token)
       return db
     (This avoids allocating a full new SDK client per request)

ACCEPTANCE CRITERIA:
  - Application starts up without error and clients are initialized once
  - 1000 concurrent requests do not create 1000 new Supabase client objects
  - get_auth_db() correctly isolates auth context per request (test with two simultaneous requests with different tokens)
  - All existing tests pass

CONSTRAINTS:
  - Use FastAPI's asynccontextmanager lifespan pattern
  - Do not change public function signatures of get_supabase(), get_current_user()
  - Validate behavior under concurrent load with locust or httpx async tests
```

---

**Ticket T-03-02: Harden rate limiting — user-keyed, all routes**

```
CONTEXT:
  File: backend/app/core/limiter.py
  File: backend/app/main.py

TASK:
  1. Create a user-aware key function:
       def get_user_or_ip_key(request: Request) -> str:
           user_id = getattr(request.state, "user_id", None)
           return user_id or get_remote_address(request)
  2. Update limiter to use this key_func
  3. Set per-endpoint limits:
       POST /users/signup: 5/hour
       POST /friends/request: 20/hour
       POST /park/session: 30/hour
       POST /lots/{id}/occupancy: 10/minute (keep existing)
       GET /admin/*: 60/minute
  4. Add X-RateLimit-* response headers

ACCEPTANCE CRITERIA:
  - POST /users/signup returns 429 after 5 requests from same user within 1 hour
  - Two users from the same IP are NOT cross-throttled
  - Rate limit headers present on all rate-limited endpoints

CONSTRAINTS:
  - Requires Redis for distributed rate limit state at multi-worker scale
  - For now: in-memory is acceptable for single-process dev; document Redis requirement
  - This ticket is a prerequisite for horizontal scaling (multi-worker)
```

---

**Ticket T-03-03: Sanitize error responses**

```
CONTEXT:
  All routers — pattern: raise HTTPException(status_code=500, detail=str(exc))

TASK:
  1. Create a custom exception handler in main.py:
       @app.exception_handler(Exception)
       async def generic_exception_handler(request, exc):
           correlation_id = getattr(request.state, "correlation_id", "unknown")
           logger.error(f"[{correlation_id}] Unhandled exception: {exc}", exc_info=True)
           return JSONResponse(
               status_code=500,
               content={"detail": "An internal error occurred.", "correlation_id": correlation_id}
           )
  2. Replace all bare `raise HTTPException(status_code=500, detail=str(exc))`
     with `raise` (let the global handler catch it) OR with a typed internal error
     that strips the exception detail.

ACCEPTANCE CRITERIA:
  - HTTP 500 responses do not include raw Python exception strings
  - Correlation ID is always present in 500 response body
  - Full exception stack trace is logged server-side with correlation ID
  - Supabase connection strings NEVER appear in any HTTP response body

CONSTRAINTS:
  - Known business errors (404, 400, 403) keep their specific detail messages
  - Only 500-class errors are sanitized
```

---

### EPIC E-04: Mobile Client Hardening

**Priority:** P1  
**Dependency:** E-01-B (migrations for schema corrections)

---

**Ticket T-04-01: Centralize API routing — remove FASTAPI_ROUTES table**

```
CONTEXT:
  File: mobile/lib/supabase.ts — fetchWithFunctionFallback()
  File: mobile/services/api.ts

TASK:
  1. Consolidate all API calls through mobile/services/api.ts (axios instance)
  2. Remove fetchWithFunctionFallback() and the FASTAPI_ROUTES array from supabase.ts
  3. api.ts already has correct base URL logic (EXPO_PUBLIC_API_URL or platform fallback)
  4. All callers of publicApiCall() and authenticatedApiCall() in supabase.ts 
     should migrate to using api.ts axios methods
  5. Keep supabase.ts for Supabase Realtime subscriptions and auth only

ACCEPTANCE CRITERIA:
  - No hardcoded route-prefix decision logic in any client file
  - Adding a new backend endpoint does NOT require updating a routing table
  - All existing screens continue to function (smoke test all 5 main tabs)
  - api.ts correctly attaches auth token via interceptor (already implemented)

CONSTRAINTS:
  - Do not break Supabase Realtime subscriptions
  - Expo environment variable EXPO_PUBLIC_API_URL must be the sole base URL source
  - Update .env.example with EXPO_PUBLIC_API_URL documentation
```

---

**Ticket T-04-02: Fix GeofenceManager background task name coupling**

```
CONTEXT:
  File: mobile/services/GeofenceManager.ts — ACTIVE_TRACKING_TASK constant
  File: mobile/services/BackgroundTasks.ts — PARKING_DETECTION_TASK constant

TASK:
  1. In BackgroundTasks.ts: export PARKING_DETECTION_TASK (already defined as a const)
  2. In GeofenceManager.ts: remove local ACTIVE_TRACKING_TASK string constant
  3. Import PARKING_DETECTION_TASK from BackgroundTasks.ts and use it for both
     startLocationUpdatesAsync and stopLocationUpdatesAsync calls

ACCEPTANCE CRITERIA:
  - One canonical task name string exists in the codebase
  - GeofenceManager stop call correctly stops the task started in BackgroundTasks
  - TypeScript compiles without errors
  - Background location tracking stops on geofence exit (manual device test)

CONSTRAINTS:
  - Do not change the task name value itself (would invalidate registered tasks)
```

---

**Ticket T-04-03: Harden confidence threshold with feature flag**

```
CONTEXT:
  File: mobile/services/BackgroundTasks.ts — hardcoded 0.8 threshold

TASK:
  1. Create mobile/constants/featureFlags.ts with:
       export const PARKING_CONFIDENCE_THRESHOLD = 
         parseFloat(process.env.EXPO_PUBLIC_PARKING_CONFIDENCE_THRESHOLD ?? '0.8');
  2. Import and use this constant in BackgroundTasks.ts instead of 0.8
  3. Document the flag in .env.example with allowed range [0.5, 1.0]

ACCEPTANCE CRITERIA:
  - Setting EXPO_PUBLIC_PARKING_CONFIDENCE_THRESHOLD=0.7 in .env lowers detection sensitivity
  - Default behavior unchanged (0.8 when not set)
  - TypeScript type is number, not string

CONSTRAINTS:
  - Clamp value to [0.5, 1.0] at parse time with a warning logged if out of range
```

---

**Ticket T-04-04: Decompose LotDetails.tsx**

```
CONTEXT:
  File: mobile/components/LotDetails.tsx (563 lines)

TASK:
  Extract into separate component files:
  1. mobile/components/lots/ForecastChart.tsx
     - Props: curve: ForecastPoint[], isLoading: boolean
     - Contains: SVG/chart rendering logic, time formatting
  2. mobile/components/lots/ForecastSlices.tsx
     - Props: slices: Record<string, ForecastPoint> | undefined
     - Contains: 15m/30m/60m quick-glance cards
  3. mobile/components/lots/OccupancyBadge.tsx
     - Props: rate: number
     - Returns: colored badge with percentage
  4. LotDetails.tsx retains: bottom sheet layout, park button, directions button,
     and composes the above components

ACCEPTANCE CRITERIA:
  - LotDetails.tsx reduces to under 200 lines
  - Each extracted component has a single prop interface with JSDoc
  - No broken layout or functionality on iOS and Android simulators
  - TypeScript strict mode passes

CONSTRAINTS:
  - Do not change any visible UI behavior
  - Maintain the expanded/collapsed sheet animation
```

---

### EPIC E-05: Intelligence Layer Abstraction

**Priority:** P2 — After P0/P1 complete  
**Dependency:** E-02 (stable data layer)

---

**Ticket T-05-01: Extract ForecastProvider interface**

```
CONTEXT:
  File: backend/app/services/forecasting.py
  File: backend/app/routers/lots.py

TASK:
  1. Create backend/app/services/forecast_provider.py with abstract base:
       from abc import ABC, abstractmethod
       class ForecastProvider(ABC):
           @abstractmethod
           def get_lot_forecast(self, lot_id, current_occupancy, capacity) -> dict:
               ...

  2. Rename ForecastingService → HeuristicForecastProvider(ForecastProvider)
  3. In lots.py, inject the provider via a dependency:
       def get_forecast_provider() -> ForecastProvider:
           return HeuristicForecastProvider()
  4. Router uses Depends(get_forecast_provider) — not a direct import

ACCEPTANCE CRITERIA:
  - GET /lots/{id}/forecast continues to work identically
  - Swapping the provider to a future MLForecastProvider requires zero router changes
  - Abstract base defines documented return shape
  - Existing forecast tests pass

CONSTRAINTS:
  - Do not change response shape
  - Keep heuristic logic intact — only wrap it
  - Python ABC enforces the interface (abstractmethod raises if not implemented)
```

---

**Ticket T-05-02: Add real occupancy history to forecast computation**

```
CONTEXT:
  File: backend/app/services/forecasting.py — HeuristicForecastProvider
  Table: occupancy_logs

TASK:
  Enhance the heuristic:
  1. Accept an optional occupancy_history parameter: list of (timestamp, occupancy_level) 
     from the last 2 hours of occupancy_logs for the lot
  2. If history is provided and has >= 5 data points:
     - Compute a short-term linear trend for the 15m and 30m slices
     - Blend this trend (weight=0.6) with the schedule profile (weight=0.4)
  3. If history is absent or sparse: use existing pure-profile logic unchanged
  4. Update the router to fetch and pass last 2h of occupancy_logs

ACCEPTANCE CRITERIA:
  - Forecast for a lot with rapidly increasing occupancy shows higher predicted values
  - Forecast for empty lot at peak hours correctly blends profile with real data
  - Forecast MAE against held-out occupancy_logs data < 15% (validated in a notebook)
  - GET /lots/{id}/forecast p95 latency remains < 300ms with the additional DB query

CONSTRAINTS:
  - Add the occupancy_logs query ONLY if the table has data for the specific lot
  - No external ML dependencies in this ticket (pure Python math only)
  - This ticket is a stepping stone to Phase 4 ML model
```

---

### EPIC E-06: Test Coverage Uplift

**Priority:** P1 (parallel with E-03)  
**Dependency:** E-01 (for correct behavior to test against)

---

**Ticket T-06-01: Unit tests for ForecastingService**

```
CONTEXT:
  File: backend/tests/test_lots.py
  File: backend/app/services/forecasting.py

TASK:
  Add the following test cases to test_lots.py:
  1. test_forecast_confidence_bands_grow_with_time:
     Assert band_width of 60m slice > band_width of 15m slice
  2. test_forecast_weekend_vs_weekday:
     Mock datetime to a Saturday 14:00 and a Wednesday 12:00
     Assert weekend expected_occupancy < weekday for the same lot/hour
  3. test_forecast_momentum_fades:
     lot with current_occupancy=200 out of 200 (100%)
     Assert 60m expected_occupancy < current expected_occupancy (momentum fades)
  4. test_forecast_label_mapping:
     rate >= 85 -> "full", 60-84 -> "high", 25-59 -> "medium", <25 -> "low"
  5. test_forecast_curve_point_count:
     Curve should have exactly 9 points (-60m to +180m in 30m steps)

ACCEPTANCE CRITERIA:
  - All 5 tests pass with pytest
  - Tests use time mocking (freezegun or monkeypatch datetime) — no real-time dependency
  - Coverage on forecasting.py reaches >= 90%

CONSTRAINTS:
  - Use pytest-freezegun or monkeypatch for time control
  - No Supabase calls in these tests — pure unit tests
```

---

**Ticket T-06-02: Integration tests for parking session lifecycle**

```
CONTEXT:
  File: backend/tests/test_park.py
  Requires: mocked Supabase client

TASK:
  Using pytest-mock or a custom fixture that patches get_auth_db and get_current_user:
  1. test_start_session_creates_row:
     Mock DB insert to return a valid session row
     Assert response contains id, lotId, startTime, active=True
  2. test_start_session_ends_existing:
     Simulate active session exists → start new session
     Assert end_parking_session is called before the new insert
  3. test_end_session_marks_inactive:
     Mock active session exists → call end
     Assert DB update called with active=False and end_time set
  4. test_invalid_lot_uuid_returns_400:
     POST /park/session with lotId="not-a-uuid"
     Assert 400 Bad Request (not 500)

ACCEPTANCE CRITERIA:
  - All 4 tests pass without a real Supabase connection
  - Test fixture pattern established for other router tests to reuse
  - test_invalid_lot_uuid_returns_400 specifically validates TD fix in T-01-B-04

CONSTRAINTS:
  - Use unittest.mock or pytest-mock for Supabase client patching
  - Create conftest.py fixture: mock_db() that returns a MagicMock with chainable .table().select()...execute()
```

---

**Ticket T-06-03: Unit tests for ParkingDetectionService (mobile)**

```
CONTEXT:
  File: mobile/services/ParkingDetectionService.ts
  Test framework: Jest (via Expo's default jest config)

TASK:
  Create mobile/services/__tests__/ParkingDetectionService.test.ts with:
  1. test computeSpeedTransitionScore — driving then stopped → 1.0
  2. test computeSpeedTransitionScore — always stopped (never drove) → 0.3
  3. test computeStillnessScore — low variance input → 1.0
  4. test computeStillnessScore — high variance (shaking) → 0
  5. test computeGpsAccuracyScore — accuracy<=10 → 1.0, accuracy=50 → 0.4
  6. test findContainingLot — point inside polygon → returns lot
  7. test findContainingLot — point outside all polygons → null
  8. test detectParking — high-confidence stop inside lot → returns candidate with confidence > 0.7

ACCEPTANCE CRITERIA:
  - All 8 tests pass with jest
  - Tests import pure functions only (no Expo native module mocking needed)
  - clearSpeedBuffer() and clearAccelBuffer() called in beforeEach

CONSTRAINTS:
  - Do not mock geofence utils — use a small real polygon test fixture
  - Tests must run in CI without a physical device
```

---

### EPIC E-07: Infrastructure & Schema Cleanup

**Priority:** P1  
**Dependency:** E-01-B

---

**Ticket T-07-01: Rename isCustom → is_custom across codebase**

```
CONTEXT:
  Files: backend/app/routers/lots.py (isCustom column references)
  Files: mobile (any reference to lot.isCustom)

TASK:
  1. Update all backend DB queries from isCustom → is_custom
  2. Search mobile codebase for lot.isCustom and update to lot.is_custom
  3. Add to migration (T-01-B-02): 
     ALTER TABLE parking_lots RENAME COLUMN "isCustom" TO is_custom; (if column exists)
     or ensure new column is named is_custom from creation

ACCEPTANCE CRITERIA:
  - grep -r "isCustom" returns zero results in application code
  - Custom lot creation and filtering still works end-to-end

CONSTRAINTS:
  - If column already exists in production Supabase as "isCustom", 
    use ALTER TABLE RENAME COLUMN (non-breaking for new code only)
```

---

**Ticket T-07-02: Create backend/.env.example**

```
CONTEXT:
  File: backend/app/core/config.py — references .env.example in error message
  ROADMAP.md Phase 0 Task 2

TASK:
  Create backend/.env.example with all documented variables:
    SUPABASE_URL=https://your-project.supabase.co
    SUPABASE_KEY=your-anon-key
    SUPABASE_JWT_SECRET=your-jwt-secret
    SUPABASE_SERVICE_ROLE_KEY=your-service-role-key (optional, admin only)
    BACKEND_CORS_ORIGINS=["http://localhost:3000","http://localhost:8081"]
    ENVIRONMENT=dev
    DEBUG=true
    PROJECT_NAME=ScarletSpots API
    VERSION=0.1.0

  Create mobile/.env.example with:
    EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
    EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
    EXPO_PUBLIC_API_URL=http://localhost:8000/api/v1
    EXPO_PUBLIC_PARKING_CONFIDENCE_THRESHOLD=0.8

ACCEPTANCE CRITERIA:
  - Both .env.example files committed to repository
  - No real credentials in either file
  - README.md updated with setup instructions referencing .env.example
  - config.py error message references backend/.env.example and is accurate

CONSTRAINTS:
  - .env files themselves remain in .gitignore
  - TEAM_ENV_ALL_KEYS.env is never committed (verify .gitignore covers it)
```

---

## APPENDIX: Non-Obvious Architectural Risks

### Risk R-01: Supabase as sole infrastructure dependency
All auth, database, and realtime runs through Supabase. A Supabase outage means 100% downtime. At 100k users, this is a contractual SLA risk. **Mitigation:** Design auth validation to support local JWT verification (PyJWT is already in requirements.txt but unused in the validation path — use it). Add a health check that independently validates Supabase connectivity.

### Risk R-02: Occupancy is crowd-sourced without anti-gaming controls
Any authenticated user can POST any `occupancy_level` to any lot. Malicious users can report 0% on all lots or 100% on a competitor's preferred lot. **Mitigation:** Require that the reporter has an active session near the lot (geofence check server-side), weight reports by reporter historical accuracy, implement anomaly detection on occupancy deltas.

### Risk R-03: Parking detection runs in the foreground of OS background tasks
`BackgroundTasks.ts` registers against `expo-task-manager` but starts the accelerometer subscription (`Accelerometer.addListener`) inside the task handler. iOS aggressively kills background tasks that start new sensor listeners. **Mitigation:** Accelerometer must be pre-started in the foreground before background transition. This is a platform constraint that requires architectural change to the task lifecycle.

### Risk R-04: Friends query makes N+1 DB calls
`get_friends()` in `friends.py` calls `_format_friend()` for every friend, and each call queries `occupancy_logs` independently. For a user with 50 friends, that's 50 sequential DB calls per GET /friends request. **Mitigation:** Fetch latest occupancy entry for all friend IDs in a single `IN (...)` query before looping.

### Risk R-05: Mobile targets both FastAPI and Supabase Edge Functions
`supabase.ts` contains a fallback chain that first tries Edge Functions then falls back. The Supabase `functions/server/` directory exists but is `DEPRECATED.md`. At scale, maintaining two parallel execution environments creates divergence risk. **Mitigation:** Complete the migration to FastAPI-only and remove Edge Function routing entirely (aligns with T-04-01).

### Risk R-06: No mechanism to expire stale parking sessions
A user who uninstalls the app or loses their phone will leave an active parking session permanently. At 100k users, this pollutes occupancy data and friends' "parked" status. **Mitigation:** Add a background Celery/cron job that expires sessions older than 24 hours, and a session TTL column.

### Risk R-07: forecast endpoint is synchronous with DB + computation
At scale, `GET /lots/{id}/forecast` will query the DB and compute inline per request. With 5,000 concurrent users all viewing the map, this becomes 5,000 concurrent forecast computations. **Mitigation:** Cache forecast responses in Redis with a 5-minute TTL. The heuristic/model output is stable over that window.
