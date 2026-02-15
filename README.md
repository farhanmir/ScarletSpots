# ScarletSpots

ScarletSpots is a smart parking system for Rutgers students. This repo is a monorepo with a native mobile app, a web admin dashboard, and Supabase Edge Functions backing both.

The product roadmap and native feature plan live in [PLAN.md](PLAN.md).

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
- Frontend Supabase project values are stored in [frontend/utils/supabase/info.tsx](frontend/utils/supabase/info.tsx).
- Mobile Supabase config is currently hard-coded in [mobile/lib/supabase.ts](mobile/lib/supabase.ts).
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
