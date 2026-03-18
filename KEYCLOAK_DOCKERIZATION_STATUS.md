# Keycloak + Full Dockerization Status

Last updated: 2026-03-18

## Objective

Complete two tracks:

1. Fully integrate Keycloak authentication across backend and mobile.
2. Fully dockerize the server stack for repeatable deploy and fast recovery.

## Current Status

### Completed

- Keycloak is running in Docker with Postgres backing store.
- Unified stack exists in root compose file:
  - app-db
  - keycloak-db
  - redis
  - keycloak
  - backend
  - pgadmin
- Backend Docker image/build is in place via backend Dockerfile.
- Backend token verification path accepts Keycloak-issued access tokens.
- Protected route validation succeeded (`/api/v1/users/me` returned 200 with Keycloak token).
- pgAdmin service is operational with valid admin email format.
- Keycloak realm/client bootstrap was performed for:
  - scarletspots
  - scarletspots-mobile
  - scarletspots-backend-admin

### In-Progress / Temporary Bootstrap Decisions

- Keycloak is in bootstrap-friendly mode (`start-dev`) to avoid HTTPS enforcement during initial setup.
- Backend currently runs on host port 8001 because host port 8000 was already occupied by an existing gunicorn process.
- Audience verification was temporarily relaxed during bootstrap troubleshooting.
- App DB schema creation used SQLAlchemy metadata create-all in container (temporary path), not a formal migration command in container startup.

## Remaining Work

## 1) Keycloak Integration Completion

- Re-enable strict token validation in backend:
  - set final KEYCLOAK_ISSUER to public production issuer
  - enable KEYCLOAK_VERIFY_AUDIENCE=true
  - confirm KEYCLOAK_AUDIENCE matches client and token claims
- Verify signup and password-reset flows end-to-end using Keycloak admin client credentials.
- Confirm websocket auth path is validated with the same production token settings.
- Complete mobile auth cutover from Supabase auth assumptions to Keycloak token lifecycle:
  - login
  - refresh
  - logout/session clear
  - bearer token injection for API and websocket auth message.

## 2) Dockerization Completion

- Move Keycloak from `start-dev` to production `start` mode.
- Add reverse proxy + TLS termination (Nginx/Caddy/Traefik) and route:
  - auth domain/path -> keycloak
  - api domain/path -> backend
- Decide and standardize backend published port strategy:
  - free 8000, or
  - keep backend mapped to 8001 and document it consistently.
- Add reliable DB migration path in containerized workflow:
  - migration command container/task
  - startup ordering with migration gate.
- Add backup/restore automation for:
  - app-db volume/dumps
  - keycloak-db volume/dumps.

## 3) Security Hardening

- Rotate all previously exposed secrets and keys immediately.
- Restrict exposed ports (especially pgAdmin) to private IP / VPN / jump host.
- Remove bootstrap/development allowances after HTTPS and production config are active.

## Recommended Execution Order

1. Secret rotation and environment cleanup.
2. Production reverse proxy + HTTPS.
3. Keycloak production mode switch.
4. Strict issuer/audience validation re-enabled and verified.
5. Mobile auth cutover and QA.
6. Migration automation + backup/restore scripts.
7. Final security lockdown and runbook validation.

## Definition of Done

- Keycloak runs in production mode behind HTTPS.
- Backend validates issuer/audience strictly with no bootstrap relaxations.
- Mobile uses Keycloak auth flow for all authenticated features.
- Unified docker stack starts cleanly on fresh host with documented commands.
- DB migrations, backups, and restores are automated and tested.
- Operational runbook exists and is verified in a restore drill.
