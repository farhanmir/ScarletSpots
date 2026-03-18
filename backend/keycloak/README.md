# Keycloak Self-Hosting (Backend Server)

This directory documents Keycloak deployment used by ScarletSpots.

## Compose File

`backend/docker-compose.keycloak.yml`

## Bring Up Keycloak

```bash
cd backend
docker compose -f docker-compose.keycloak.yml pull
docker compose -f docker-compose.keycloak.yml up -d
```

Default local URL: `http://localhost:8080`

## Required Setup

In Keycloak admin console:

1. Create realm: `scarletspots`
2. Create app client (OIDC): `scarletspots-mobile`
3. Create confidential admin client: `scarletspots-backend-admin`
4. Enable client authentication on admin client
5. Grant service-account permissions to manage users
6. Copy client secret for backend `.env`

## Backend Env Mapping

```bash
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=scarletspots
KEYCLOAK_AUDIENCE=scarletspots-mobile
KEYCLOAK_ADMIN_CLIENT_ID=scarletspots-backend-admin
KEYCLOAK_ADMIN_CLIENT_SECRET=<secret>
```

Optional:

```bash
KEYCLOAK_ISSUER=
KEYCLOAK_JWT_PUBLIC_KEY=
KEYCLOAK_PASSWORD_RESET_CLIENT_ID=scarletspots-mobile
KEYCLOAK_PASSWORD_RESET_REDIRECT_URI=
```

## pgAdmin4 and DB Operations

Keycloak uses its own Postgres container/database. For operations:

- add Keycloak DB server in pgAdmin4
- verify realm/client tables after backup restore
- validate service-account/client entries post-migration

## Production Recommendations

- terminate TLS at reverse proxy (Nginx/Caddy/Traefik)
- set stable public hostname
- keep admin credentials and client secrets outside git
- run regular backups of keycloak DB
- test restore at least once per release cycle
