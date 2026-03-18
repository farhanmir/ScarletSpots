# Logto + Full Dockerization Status

Last updated: 2026-03-18

## Objective

Complete the transition from Keycloak to **Logto** for a more modern, developer-friendly authentication experience while maintaining a fully dockerized server stack.

## Current Status

### Completed

- Logto infrastructure is defined in `docker-compose.yml` (using `ghcr.io/logto-io/logto:latest`).
- Unified stack updated to use `logto-db` (Postgres 17).
- Backend `config.py` and `security.py` fully migrated from Keycloak to Logto:
  - OIDC discovery and JWT verification implemented for Logto.
  - `LogtoManagementService` implemented for user creation (signup) and password resets.
  - Compat facade maintained so routers (e.g. `users.py`) require zero changes.
- Mobile `.env` and `.env.example` updated with Logto OIDC variables.
- Documentation (`README.md`, `ROADMAP.md`, etc.) scrubbed of Keycloak mentions.
- Deprecated `backend/keycloak` directory removed.
- pgAdmin pre-configured for `app-db` and `logto-db`.

### In-Progress

- Full server redeploy to transition from the failed Keycloak stack to the new Logto stack.
- M2M application setup in Logto Console (required for backend admin operations).
- Native App setup in Logto Console (required for mobile auth).

## Remaining Work

### 1) Server Deployment & Bootstrap
- Push all changes to the OCI server.
- Run `docker compose down -v && docker compose up --build -d`.
- Access Logto Console at `http://<server-ip>:3002`:
  - Complete the "Get Started" wizard.
  - Create a **Machine-to-Machine (M2M)** app.
  - Create a **Native App** for mobile.
  - Update server `.env` with the new IDs and secrets.

### 2) Integration Verification
- Verify that the mobile app can successfully perform OIDC login via Logto.
- Verify that the backend can create users via the Management API during signup.
- Verify that password reset emails are triggered correctly.

### 3) Security Hardening
- Move Logto behind a reverse proxy with HTTPS (Caddy/Nginx).
- Enforce strict audience and issuer verification once public URLs are stable.
- Restrict pgAdmin and Logto Admin ports to internal/VPN access.

## Definition of Done

- Logto is the sole identity provider for ScarletSpots.
- Backend manages users via Logto Management API.
- Mobile app successfully completes the OIDC flow.
- The entire stack (Backend, Logto, DBs, Redis, pgAdmin) starts with one command.
- Production environment is secured with HTTPS and rotated secrets.
