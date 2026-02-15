# ScarletSpots Mobile

## Environment variables

Create a `.env` file in `mobile/` (or copy from `.env.example`) with:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

These are required by `lib/supabase.ts` for authentication and edge-function calls.

## Run locally

```bash
npm install
npx expo start
```
