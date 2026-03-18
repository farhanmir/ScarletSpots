# ScarletSpots Backend

FastAPI backend for Rutgers parking sessions, occupancy, favorites, friendships, and profile data.

## Auth and Identity

Authentication is Logto-based.

- Access tokens are validated against Logto issuer/JWKS via OIDC discovery.
- Signup and password reset use Logto Management API through an M2M app.
- Rutgers email domain rules are still enforced by backend business logic.

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and set values.

Core identity variables:

```bash
LOGTO_ENDPOINT=http://logto:3001
LOGTO_ISSUER=http://<server-host>:3001/oidc
LOGTO_AUDIENCE=
LOGTO_VERIFY_AUDIENCE=false

LOGTO_M2M_APP_ID=replace-after-creating-m2m-app
LOGTO_M2M_APP_SECRET=replace-after-creating-m2m-app
LOGTO_MANAGEMENT_API_RESOURCE=https://default.logto.app/api
```

Core data variables:

```bash
DATABASE_URL=postgresql+asyncpg://scarlet_admin:change-me@localhost:5432/scarletspots
REDIS_URL=redis://localhost:6379/0
```

## Run Locally (Non-Docker)

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Full Stack Docker (Recommended)

From repository root:

```bash
docker compose pull
docker compose up --build -d
```

Stack services:

- `app-db` (Postgres for app data)
- `logto-db` (Postgres for Logto)
- `redis`
- `logto`
- `backend`
- `pgadmin`

## First-Time Logto Setup

1. Open Logto admin console at `http://<server-host>:3002`.
2. Complete tenant initialization wizard.
3. Create a Machine-to-Machine app for backend management operations.
4. Grant it Management API access.
5. Create a Native app for mobile login.
6. Put generated app IDs/secrets into `backend/.env` and mobile env.
7. Restart backend after env updates:

```bash
docker compose up -d --force-recreate backend
```

## Health Checks

- Backend health: `http://<server-host>:8001/health`
- Logto API health: `http://<server-host>:3001/api/status`

## pgAdmin Guidance

Use pgAdmin4 to:

- connect to `app-db` and `logto-db`
- inspect migrations and schema state
- verify recovery data integrity

Security guidance:

- keep pgAdmin behind private network controls
- do not expose pgAdmin publicly in production

## Testing

```bash
cd backend
pytest tests/
```
