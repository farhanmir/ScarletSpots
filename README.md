# ScarletSpots

ScarletSpots is a smart parking system for Rutgers students. This repo is a monorepo with a native mobile app, a web admin dashboard, and a FastAPI backend.

The product roadmap and native feature plan live in [PLAN.md](PLAN.md).

## Planning docs guide
This repo uses three core planning documents. Together they define what to build, in what order, and how the shipped app should behave for users.

### [PLAN.md](PLAN.md) — Product + architecture contract
Use this when deciding **what must exist** for production launch.

What it contains:
- Launch targets, SLOs, reliability and quality bars
- Production architecture (mobile, backend, data, security)
- Required feature capabilities (detection, compass, social, heatmap, forecasting)
- Non-negotiable Definition of Done

How to use it:
1. Before implementation, verify the feature is explicitly represented in `PLAN.md`.
2. During implementation, map design/tech choices to the plan requirements.
3. Before merge/release, check Definition of Done criteria against your change.

### [ROADMAP.md](ROADMAP.md) — Execution sequence and delivery gates
Use this when deciding **what to do next** and release order.

What it contains:
- Phase-by-phase execution path
- Prioritized backlog
- Exit criteria and hard launch gates
- Timeline and cross-cutting quality gates

How to use it:
1. Pick work from the current active phase.
2. Link every ticket/PR to a roadmap item.
3. Do not move phases forward until exit criteria are satisfied.

### [PRODUCT_EXPERIENCE_BLUEPRINT.md](PRODUCT_EXPERIENCE_BLUEPRINT.md) — Behavioral source of truth
Use this when deciding **exactly how the app should behave** for users.

What it contains:
- End-to-end user journeys (tap-by-tap)
- State transitions, edge cases, error handling, recovery flows
- Long-term usage expectations (e.g., daily user over a year)
- Strict logic audit of current implementation and required corrections

How to use it:
1. For every UI/API flow, implement to match blueprint behavior.
2. Build QA scenarios directly from blueprint acceptance paths.
3. If implementation differs, document the delta and get architecture/product sign-off.

### Recommended workflow
1. Start with `PLAN.md` to confirm scope and non-functional requirements.
2. Use `ROADMAP.md` to choose priority and sequencing.
3. Implement and test against `PRODUCT_EXPERIENCE_BLUEPRINT.md` behavior.
4. Ship only when all three documents are satisfied.

## Repo layout
- Mobile app (Expo): [mobile/](mobile/)
- Web admin (React + Vite): [frontend/](frontend/)
- FastAPI backend: [backend/](backend/)
- Database migrations: [backend/supabase/migrations](backend/supabase/migrations)

## Current status
- Mobile app: navigation, auth, tabs, maps, offline queuing, and geofence detection in [mobile/](mobile/)
- Web admin: Leaflet-based lot views, auth, and session flows in [frontend/](frontend/)
- Backend: FastAPI service for auth, sessions, lots, friends, compass, admin, and favorites in [backend/](backend/)

## Quick start

### Web admin
```bash
cd frontend
npm install
npm run dev
```

### Mobile app
```bash
cd mobile
npm install
npx expo start
```

### FastAPI backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Configuration
- Frontend Supabase config is loaded from `frontend/.env` via `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Mobile Supabase config is loaded from `mobile/.env` via `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- Backend config is loaded from `backend/.env` via `SUPABASE_URL`, `SUPABASE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. See `backend/.env.example` for all required variables.

## Backend API (FastAPI)
Base URL: `http://localhost:8000/api/v1` (development)

Endpoints:
- `GET /health`
- `POST /users/signup`
- `GET /users/me`
- `PATCH /users/me`
- `POST /park/session`
- `POST /park/session/end`
- `GET /park/session/active`
- `GET /compass`
- `GET /lots`
- `GET /lots/{id}`
- `POST /lots/init`
- `POST /lots/custom`
- `PUT /lots/custom/{id}`
- `DELETE /lots/custom/{id}`
- `POST /friends/request`
- `POST /friends/accept`
- `POST /friends/block`
- `GET /friends`
- `PUT /friends/{id}/sharing`
- `GET /admin/stats`
- `GET /admin/users`
- `GET /favorites`
- `POST /favorites`
- `DELETE /favorites/{id}`

## Roadmap (from the plan)
- Offline-first resilience (action queuing & local caching)
- Geofence-based parking detection and spot confirmation
- Compass navigation (Knight Needle)
- Heat maps and rush-hour prediction
- Friend privacy controls and sharing
- Admin geofence editor and analytics views

## Notes
- [PLAN.md](PLAN.md) is the source of truth for the long-term native build and data model.
- [ENGINEERING_ANALYSIS.md](ENGINEERING_ANALYSIS.md) documents the architecture audit and resolved/outstanding technical debt.
