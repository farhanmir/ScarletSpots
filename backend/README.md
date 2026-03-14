# ScarletSpots Backend

FastAPI service providing the API layer for the ScarletSpots mobile app and web admin portal.

## Environment variables

Copy `.env.example` to `.env` in `backend/` and fill in the values:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SUPABASE_JWT_SECRET=your-supabase-jwt-secret
```

## Run locally

```bash
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

Migrations are in `supabase/migrations/` and should be applied in filename order using the Supabase CLI:

```bash
supabase db push
```

## API prefix

All routes are prefixed with `/api/v1`. See `app/main.py` for the full router list.

## Local environment notes

Recommended Python version: 3.11 (matches CI and avoids local build-toolchain issues on Python 3.14).

If make is not available on your system (common on Windows), run tools directly:

```bash
python -m ruff check app tests
python -m ruff format --check app tests
python -m mypy app --ignore-missing-imports --no-strict-optional
python -m bandit -r app -x tests
python -m pip_audit
python -m vulture app --min-confidence 80
```
