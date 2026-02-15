# ScarletSpots

ScarletSpots is a smart parking system for Rutgers students. This repo is a monorepo with a native mobile app, a web admin dashboard, and Supabase Edge Functions backing both.

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
- Edge Functions (Hono + KV): [backend/supabase/functions/server](backend/supabase/functions/server)
- Legacy snapshot of earlier web work: [ScarletSpots/](ScarletSpots/)

## Current status
- Mobile app: core navigation, auth shell, tabs, and maps scaffolding in [mobile/](mobile/)
- Web admin: Leaflet-based lot views, auth, and session flows in [frontend/](frontend/)
- Backend: Supabase Edge Functions for auth, sessions, lots, and friends in [backend/supabase/functions/server](backend/supabase/functions/server)

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
npm run start
```

### Edge Functions
The Edge Function source is in [backend/supabase/functions/server](backend/supabase/functions/server). Deploy or serve using the Supabase CLI from that folder.

## Configuration
- Frontend Supabase config is loaded from `frontend/.env` via `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Mobile Supabase config is loaded from `mobile/.env` via `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- Edge Functions read `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from the environment.

## Edge Function API (base path)
Base URL: `https://<project>.supabase.co/functions/v1/server`

Endpoints:
- `GET /health`
- `POST /signup`
- `GET /user/profile`
- `POST /park/session`
- `POST /park/session/end`
- `GET /park/session/active`
- `GET /lot/:id`
- `GET /lots`
- `POST /lots/init`
- `POST /lots/custom`
- `PUT /lots/custom/:id`
- `DELETE /lots/custom/:id`
- `POST /friends/request`
- `POST /friends/accept`
- `GET /friends`

## Roadmap (from the plan)
- Geofence-based parking detection and spot confirmation
- Compass navigation (Knight Needle)
- Heat maps and rush-hour prediction
- Friend privacy controls and sharing
- Admin geofence editor and analytics views

## Notes
- [PLAN.md](PLAN.md) is the source of truth for the long-term native build and data model.
- [ScarletSpots/](ScarletSpots/) is a legacy snapshot and should not be treated as the active implementation.
