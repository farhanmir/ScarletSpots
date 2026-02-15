# ScarletSpots Frontend

## Environment variables

Create a `.env` file in `frontend/` (or copy from `.env.example`) with:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

These are required by `src/app/lib/supabase.ts` for auth and API calls.

## Run locally

```bash
npm install
npm run dev
```
