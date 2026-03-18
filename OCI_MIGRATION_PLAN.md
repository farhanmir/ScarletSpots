# ScarletSpots OCI Migration Plan

## Goal

Deploy ScarletSpots on OCI Always Free with a recoverable containerized architecture.

## Target Runtime on OCI

- Compute: OCI Ampere A1 (Always Free)
- Orchestration: Docker Compose
- App data: Postgres container + persistent volume
- Realtime bus: Redis container
- Identity: Keycloak + dedicated Postgres container
- DB admin: pgAdmin4
- API: FastAPI container

## Why This Design

- Removes dependence on managed Supabase Auth
- Keeps identity and app data under your control
- Supports fast rebuild/recovery on a new VM
- Keeps operational stack small and understandable

## Networking and Security

- Expose only required public ports (typically 80/443 via reverse proxy).
- Keep Postgres, Redis, pgAdmin private on internal docker network.
- Place Keycloak and API behind HTTPS.
- Store secrets in `.env` outside source control.

## Deployment Sequence

1. Provision OCI instance and attach persistent storage.
2. Install Docker Engine and Compose plugin.
3. Copy repository + environment files.
4. Pull latest images.
5. Start stack with compose.
6. Run smoke checks:
   - API health
   - Keycloak realm endpoint
   - DB connectivity
   - WebSocket handshake

## Backup and Restore Strategy

### Backups

- Daily `pg_dump` for app-db and keycloak-db
- Optional periodic volume snapshots
- Secure copy to Object Storage or off-host target

### Restore

1. Provision replacement host.
2. Restore repo + env + compose definitions.
3. Restore DB dumps or mounted volumes.
4. Start compose stack.
5. Verify login, protected routes, and occupancy updates.

## pgAdmin4 Operations

Use pgAdmin4 for:

- inspecting migration state
- validating restored data
- running emergency read queries
- confirming table/index presence post-recovery

Operational recommendation:

- allow pgAdmin access only from VPN or private admin subnet

## Acceptance Criteria

- Auth works via Keycloak after full restart
- API and websocket paths remain functional
- Restore drill can be executed in a single session without undocumented steps
- Recovery docs are current and tested
