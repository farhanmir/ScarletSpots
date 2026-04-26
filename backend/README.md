# ScarletSpots Backend

FastAPI service providing the API layer for the ScarletSpots mobile app.

## Run with Docker Compose (recommended)

From the repository root:

```bash
cp backend/.env.example backend/.env
docker compose up -d --build
```

API base URL: `http://localhost:8000/api/v1`

## Environment variables

Copy `.env.example` to `.env` in `backend/` and fill in the values:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SUPABASE_JWT_SECRET=your-supabase-jwt-secret
# Optional for ES256 projects (PEM public key). If omitted, backend uses Supabase JWKS endpoint.
SUPABASE_JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/scarletspots
REDIS_URL=redis://localhost:6379/0
ENABLE_HEURISTIC_SEEDED_OCCUPANCY=True
TRAFFIC_PROVIDER=none
TOMTOM_API_KEY=
TRAFFIC_CACHE_TTL_SECONDS=300
```

### High-value data protection (anti-scraping / anti-clone)

Enable strict policy in production so occupancy and forecast data only flows to
authenticated, attested app sessions:

```bash
REQUIRE_AUTH_ON_AVAILABILITY=True
REQUIRE_ATTESTATION_ON_AVAILABILITY=True
ATTESTATION_ENFORCE=True
ATTESTATION_SIGNING_SECRET=<strong-random-secret>
ATTESTATION_TOKEN_TTL_SECONDS=180
```

Notes:

- `REQUIRE_ATTESTATION_ON_AVAILABILITY` + `ATTESTATION_ENFORCE` gates both
  REST high-value routes and realtime WebSocket channels.
- Attestation tokens are device/platform-bound and short-lived.
- Rotate `ATTESTATION_SIGNING_SECRET` periodically and immediately on any leak.

### Bootstrap forecasting flags

- `ENABLE_HEURISTIC_SEEDED_OCCUPANCY`: when true, `/lots/occupancy` seeds non-zero
  counts for sparse lots using the heuristic model.
- `TRAFFIC_PROVIDER`: `none` or `tomtom`; affects the traffic multiplier in heuristic forecasts.
- `TOMTOM_API_KEY`: required when `TRAFFIC_PROVIDER=tomtom`.
- `TRAFFIC_CACHE_TTL_SECONDS`: cache TTL for traffic lookups to avoid API churn.

## Run locally (native Python)

```bash
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`.
Interactive API docs: `http://localhost:8000/api/v1/openapi.json`

## Run tests

```bash
pytest tests/
```

## Development quality checks

Install development tools:

```bash
pip install -r requirements-dev.txt
```

Run the full local quality gate:

```bash
make check
```

Auto-fix what can be fixed automatically:

```bash
make fix
```

Run individual checks:

```bash
make lint         # Ruff lint checks
make format-check # Ruff formatting check
make typecheck    # mypy type checking
make security     # Bandit security scan
make deps-audit   # pip-audit dependency vulnerability scan
make deadcode     # Vulture dead code scan
```

## Database migrations

Migrations are managed by Alembic and located in `migrations/`.

To create a new migration from model changes:

```bash
alembic revision --autogenerate -m "description of changes"
```

To apply migrations to the database:

```bash
alembic upgrade head
```

## API prefix

All routes are prefixed with `/api/v1`. See `app/main.py` for the full router list.

## Local environment notes

Recommended Python version: 3.11+ for local development.
Docker runtime in production-style local stack uses Python 3.12 (`backend/Dockerfile`).

If make is not available on your system (common on Windows), run tools directly:

```bash
python -m ruff check app tests
python -m ruff format --check app tests
python -m mypy app --ignore-missing-imports --no-strict-optional
python -m bandit -r app -x tests
python -m pip_audit
python -m vulture app --min-confidence 80
```
