# ScarletSpots Backend

FastAPI service for dynamic parking state, forecasts, social data, websocket fan-out, push delivery, and attestation/session support.

## Local run

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

Useful URLs:

- `http://localhost:8000/health`
- `http://localhost:8000/docs`

## Required environment

At minimum, configure:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `DATABASE_URL`

Common optional local settings:

- `REDIS_URL`
- `REQUIRE_ATTESTATION_ON_AVAILABILITY`
- `ATTESTATION_ENFORCE`
- `ENABLE_HEURISTIC_SEEDED_OCCUPANCY`
- `CIRCLING_METRIC_ENABLED`

## Main responsibilities

- profiles and account lifecycle
- parking session start/end and active-session restore
- lot occupancy payloads and forecast responses
- circling and feedback collection
- favorites and friendships
- occupancy and notifications websockets
- push token registration and dispatch
- attestation/session token issuance

## Main router groups

- `/api/v1/users`
- `/api/v1/lots`
- `/api/v1/park/session`
- `/api/v1/friends`
- `/api/v1/favorites`
- `/api/v1/system`
- `/ws/occupancy`
- `/ws/notifications`

## Quality commands

```bash
pytest tests/
make check
make fix
```

## Migrations

```bash
alembic upgrade head
```

## Notes

- this backend serves the native iOS client first
- lot metadata lives in bundled JSON/SQLite on the client side, not in a backend lots table
- occupancy responses intentionally include pre-launch honesty metadata so clients can distinguish live signal from pattern guidance

Last reviewed: 2026-04-26
