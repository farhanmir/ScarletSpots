# ScarletSpots Execution Plan

This is the active implementation plan for platform hardening.

## Objective

Complete the transition to:

- Logto-authenticated backend
- dockerized server stack for one-command recovery
- pgAdmin4-enabled DB operations runbook

## Scope

In scope:

1. Replace Supabase Auth and Rutgers CAS strategy with Logto OIDC.
2. Keep existing backend data model and app features stable.
3. Run backend dependencies in containers.
4. Document restore/recovery workflow.

Out of scope:

- major feature redesigns unrelated to auth/deployment
- replacing Postgres data model with a new schema family

## Workstreams

### A. Authentication Migration

1. Backend token verification uses Logto issuer/JWKS.
2. Signup and password reset route through Logto Management APIs.
3. WebSocket auth uses the same Logto access token verification.
4. Mobile auth integration points switched from Supabase auth SDK assumptions.

### B. Dockerized Platform

1. Compose services:
   - `api`
   - `app-db`
   - `redis`
   - `logto`
   - `logto-db`
   - `pgadmin`
2. Env var templates and secret handling.
3. Health checks and startup order.

### C. Recovery and Operations

1. Backup strategy for app-db and logto-db.
2. Restore drill documentation (RTO target: under 30 minutes for core API + auth).
3. pgAdmin4 procedures for validation after restore.

## Milestones

1. M1: Logto auth wired end-to-end in backend and websocket entrypoints.
2. M2: Compose stack runs locally with logto + postgres + redis + api + pgadmin.
3. M3: OCI deployment dry run with backup/restore tested.
4. M4: Mobile release candidate using Logto tokens in production-like environment.

## Validation Checklist

- Login issues valid Logto token and backend accepts it.
- `GET /api/v1/users/me` works with Logto JWT.
- `POST /api/v1/park/session` and websocket occupancy updates still function.
- Password reset endpoint triggers Logto recovery flow.
- pgAdmin can connect to both app-db and logto-db.
- Full stack restart recovers cleanly from persisted volumes.

## Ownership

- Identity and auth integration: backend team
- Mobile token flow and session handling: mobile team
- Compose/deployment/backups: platform/devops
- Runbooks and incident readiness: shared ownership
