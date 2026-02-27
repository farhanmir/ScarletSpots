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

## Database migrations

Migrations are in `supabase/migrations/` and should be applied in filename order using the Supabase CLI:

```bash
supabase db push
```

## API prefix

All routes are prefixed with `/api/v1`. See `app/main.py` for the full router list.
