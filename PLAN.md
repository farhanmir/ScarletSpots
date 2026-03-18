# ScarletSpots Execution Plan

This is the active implementation plan for platform hardening.

## Objective

Complete the transition to:

- Keycloak-authenticated backend
- dockerized server stack for one-command recovery
- pgAdmin4-enabled DB operations runbook

## Scope

In scope:

1. Replace Supabase Auth and Rutgers CAS strategy with Keycloak OIDC.
2. Keep existing backend data model and app features stable.
3. Run backend dependencies in containers.
4. Document restore/recovery workflow.

Out of scope:

- major feature redesigns unrelated to auth/deployment
- replacing Postgres data model with a new schema family

## Workstreams

### A. Authentication Migration

1. Backend token verification uses Keycloak issuer/JWKS.
2. Signup and password reset route through Keycloak admin APIs.
3. WebSocket auth uses the same Keycloak access token verification.
4. Mobile auth integration points switched from Supabase auth SDK assumptions.

### B. Dockerized Platform

1. Compose services:
   - `api`
   - `app-db`
   - `redis`
   - `keycloak`
   - `keycloak-db`
   - `pgadmin`
2. Env var templates and secret handling.
3. Health checks and startup order.

### C. Recovery and Operations

1. Backup strategy for app-db and keycloak-db.
2. Restore drill documentation (RTO target: under 30 minutes for core API + auth).
3. pgAdmin4 procedures for validation after restore.

## Milestones

1. M1: Keycloak auth wired end-to-end in backend and websocket entrypoints.
2. M2: Compose stack runs locally with keycloak + postgres + redis + api + pgadmin.
3. M3: OCI deployment dry run with backup/restore tested.
4. M4: Mobile release candidate using Keycloak tokens in production-like environment.

## Validation Checklist

- Login issues valid Keycloak token and backend accepts it.
- `GET /api/v1/users/me` works with Keycloak JWT.
- `POST /api/v1/park/session` and websocket occupancy updates still function.
- Password reset endpoint triggers Keycloak action email.
- pgAdmin can connect to both app-db and keycloak-db.
- Full stack restart recovers cleanly from persisted volumes.

## Ownership

- Identity and auth integration: backend team
- Mobile token flow and session handling: mobile team
- Compose/deployment/backups: platform/devops
- Runbooks and incident readiness: shared ownership
