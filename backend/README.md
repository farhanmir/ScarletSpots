# ScarletSpots Backend

FastAPI API service for sessions, occupancy, friends, favorites, and profile data.

## Auth and Identity

Authentication is Keycloak-based.

- Access tokens are validated against Keycloak issuer/JWKS
- Signup and password reset use Keycloak admin operations
- Rutgers email domain rules remain enforced in backend logic

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and set values.

Key identity variables:

```bash
KEYCLOAK_URL=https://auth.your-domain.com
KEYCLOAK_REALM=scarletspots
KEYCLOAK_ISSUER=
KEYCLOAK_AUDIENCE=scarletspots-mobile
KEYCLOAK_VERIFY_AUDIENCE=true
KEYCLOAK_JWT_PUBLIC_KEY=
KEYCLOAK_ADMIN_CLIENT_ID=scarletspots-backend-admin
KEYCLOAK_ADMIN_CLIENT_SECRET=replace-with-secret
KEYCLOAK_PASSWORD_RESET_CLIENT_ID=scarletspots-mobile
KEYCLOAK_PASSWORD_RESET_REDIRECT_URI=
```

Data layer variables:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/scarletspots
REDIS_URL=redis://localhost:6379/0
```

## Run Locally (Non-Docker)

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Keycloak Self-Hosting (Docker)

A dedicated compose file is included:

- `docker-compose.keycloak.yml`

Run:

```bash
docker compose -f docker-compose.keycloak.yml pull
docker compose -f docker-compose.keycloak.yml up -d
```

Keycloak setup details are in `keycloak/README.md`.

## Whole-Server Dockerization Target

The intended production stack is:

- API service
- Postgres for app data
- Redis
- Keycloak
- Keycloak Postgres
- pgAdmin4

If only Keycloak compose is currently present, treat it as the first stage; keep the rest of the stack documented and staged in deployment runbooks until all compose artifacts are committed.

## pgAdmin4 Guidance

Use pgAdmin4 to:

- connect to app-db and keycloak-db
- inspect migration status
- validate post-restore data integrity
- run emergency diagnostics

Security:

- private network access only
- do not expose pgAdmin4 directly to the public internet

## Recovery Checklist

1. Restore `.env` secrets.
2. Pull latest images.
3. Start identity and data services.
4. Start API service.
5. Validate:
   - `/health`
   - Keycloak realm endpoints
   - protected API route with bearer token
   - websocket auth + occupancy fanout
6. Verify DB integrity through pgAdmin4.

## Testing

```bash
pytest tests/
```

If running tests in a fresh environment, install backend dependencies first (including SQLAlchemy and related packages).
