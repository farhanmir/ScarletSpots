# ScarletSpots Architecture

## Core Principle

Static lot metadata is bundled in the mobile app. Dynamic state lives in the backend data store.

- Static: lot names, polygons, coordinates, capacities, photos
- Dynamic: sessions, occupancy counts, friends, favorites, profiles

## High-Level Components

```text
Mobile (Expo)
  -> Logto OIDC login
  -> FastAPI API calls
  -> WebSocket subscriptions (occupancy + notifications)

FastAPI Backend
  -> Verifies Logto JWT access tokens
  -> Uses Postgres-compatible DB for app tables
  -> Uses Redis pub/sub for realtime fanout
  -> Publishes push notifications (Expo)

Data + Identity Infrastructure
  -> Postgres (app data)
  -> Logto + Logto Postgres
  -> pgAdmin4 for DB admin/recovery workflows
```

## Authentication Architecture (Logto)

### Why

- Replaces legacy Supabase Auth dependency
- Replaces Rutgers CAS-only SSO plan
- Supports self-hosted identity and long-term control

### Flow

1. Mobile obtains access token from Logto native app flow.
2. Mobile calls backend with `Authorization: Bearer <token>`.
3. Backend verifies token using Logto issuer + JWKS.
4. Backend maps `sub` to internal profile identity.
5. Protected routes and websocket auth rely on this token verification.

### Backend Contract

- JWT issuer: `LOGTO_ISSUER` (or derived from `LOGTO_ENDPOINT`)
- Audience validation: controlled by `LOGTO_VERIFY_AUDIENCE`
- Admin operations: `LOGTO_M2M_APP_ID/LOGTO_M2M_APP_SECRET`

## Data Model (Operational)

Core tables:

- `profiles`
- `parking_sessions`
- `lot_occupancy`
- `friendships`
- `user_favorites`
- `device_push_tokens`

Identity source is Logto; app profile rows remain in backend DB.

## Realtime Architecture

Realtime is backend-owned:

- API writes update occupancy/session state.
- Backend publishes lot/user events to Redis channels.
- WebSocket manager fans out to connected clients.
- Closed-app users rely on push notifications.

See `WEBSOCKET_BACKGROUND_PARKING_ARCHITECTURE.md` for details.

## Dockerized Server Topology

Target operational stack:

- `api`: FastAPI backend
- `app-db`: Postgres for app data
- `redis`: pub/sub + cache
- `logto`: identity provider
- `logto-db`: Postgres for Logto
- `pgadmin`: DB GUI and emergency operations

This layout supports quick recovery by restoring DB data and relaunching compose services.

## pgAdmin4 Role

pgAdmin4 is the operational database console for:

- schema validation
- migration verification
- emergency query/debug sessions
- restore/import checks after incidents

Recommended practice:

- keep pgAdmin behind auth/network controls
- avoid exposing pgAdmin publicly
- maintain saved server connections for app-db and logto-db

## Disaster Recovery Design

Recovery objectives are based on container and volume restoration:

1. Restore compose files and environment secrets.
2. Restore Postgres volume snapshots or SQL dumps.
3. Bring up `logto-db`, `logto`, `app-db`, `redis`, `api`, `pgadmin`.
4. Validate health endpoints and login flow.
5. Verify websocket fanout and push token persistence.
