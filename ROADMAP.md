# ScarletSpots Roadmap

## Phase 1: Architecture Pivot (Completed)

- Static lot data bundled in mobile app
- Dynamic occupancy/session state handled by backend
- Realtime path consolidated through backend websocket manager

## Phase 2: Reliability and Core UX (Completed)

- session lifecycle stabilized
- friends and favorites flows hardened
- offline queue and map-first experience improved

## Phase 3: Forecasting (In Progress)

- heuristic and ML-backed forecast providers
- data quality loops and feedback path

## Phase 4: Identity and Platform Hardening (Active)

### 4.1 Logto Migration

- replace Supabase Auth assumptions with Logto OIDC
- remove Rutgers CAS as primary auth protocol
- unify HTTP + WebSocket auth token verification

### 4.2 Dockerized Full Stack

- run API, Postgres, Redis, Logto, Logto DB, pgAdmin4 in compose-managed services
- define restart and health-check strategy
- keep env templates and secret docs current

### 4.3 Recovery Readiness

- backup and restore drills for app-db and logto-db
- host rebuild playbook with minimal manual steps
- post-restore validation checklist

## Phase 5: Launch Operations

- OCI deployment with hardened network boundaries
- monitoring and error budget definition
- staged release flow for mobile builds

## Backlog (Post-Platform)

- richer occupancy/favorite push alerting
- optional social/academic identity enhancements
- admin tools and analytics views
- iOS Live Activities / widgets expansion
