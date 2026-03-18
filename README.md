# ScarletSpots

Real-time Rutgers parking availability with a mobile-first architecture.

## Current Direction (March 2026)

ScarletSpots is standardizing on:

- Logto for authentication (replacing Rutgers CAS-only plan and Supabase Auth)
- Supabase/Postgres-compatible relational data model for app data
- FastAPI backend with Redis-assisted realtime fanout
- Dockerized backend stack for fast disaster recovery and reproducible deploys
- pgAdmin4 for DB operations, inspections, and emergency recovery workflows

## Repository Structure

```text
ScarletSpots/
├── mobile/              # Expo React Native app
├── backend/             # FastAPI service + compose files
├── ARCHITECTURE.md
├── PLAN.md
├── ROADMAP.md
├── OCI_MIGRATION_PLAN.md
└── RU_SSO_GUIDE.md      # Historical doc now superseded by Logto plan
```

## Auth Status

Authentication is now documented around Logto OIDC/JWT, not Supabase Auth and not Rutgers CAS ticket validation.

- Backend validates Logto access tokens via issuer + JWKS
- Backend signup/password reset endpoints are wired to Logto Management APIs
- Rutgers domain restrictions still apply in app/business logic

See:

- `backend/README.md`
- `backend/README.md`
- `ARCHITECTURE.md`

## Dockerization + Recovery Goal

Primary operational target is a full containerized server stack so the app can be recovered quickly on a fresh host.

Recovery playbook focus:

1. Pull infra/app images
2. Restore DB volume or dump
3. Bring up stack with compose
4. Verify Logto, API health, and websocket channels

Detailed plans:

- `OCI_MIGRATION_PLAN.md`
- `PLAN.md`

## Quick Start (Local Dev)

### Mobile

```bash
cd mobile
npm install
npx expo start
```

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Documentation Index

- `ARCHITECTURE.md`: system design and data/auth flows
- `PLAN.md`: execution plan for migration and operations
- `ROADMAP.md`: phased product + platform milestones
- `OCI_MIGRATION_PLAN.md`: OCI hosting and operations strategy
- `RU_SSO_GUIDE.md`: deprecation notice + migration notes to Logto
- `WEBSOCKET_BACKGROUND_PARKING_ARCHITECTURE.md`: realtime and background updates
