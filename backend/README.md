# ScarletSpots Backend

FastAPI service for dynamic parking state, social data, forecast APIs, websocket fan-out, and push-related flows.

## Run locally

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows PowerShell
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Key responsibilities

- profile/account data
- parking sessions
- lot occupancy counts
- favorites
- friendships
- forecast responses
- websocket and notification plumbing

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

## Important note

This backend serves the native iOS app first. The old React Native client remains in the repo, but backend evolution should align with current native behavior.

Last reviewed: 2026-04-26
