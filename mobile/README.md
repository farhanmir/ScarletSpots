# ScarletSpots Mobile

## Purpose

Expo React Native app for Rutgers parking occupancy, sessions, and friend visibility.

## Environment Variables

Create `mobile/.env` with:

```bash
EXPO_PUBLIC_API_URL=http://localhost:8000/api/v1
EXPO_PUBLIC_ENABLE_ALL_CAMPUSES=false

# Keep only if legacy code paths still reference them during migration:
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

Auth direction is Keycloak-backed token flow through backend APIs.

## Run Locally

```bash
cd mobile
npm install
npx expo start
```

## Auth Notes

- Mobile should authenticate against Keycloak realm/client configuration.
- Backend protected routes require bearer access token.
- During migration cleanup, remove remaining Supabase-auth-only assumptions from mobile auth providers/services.

## Operational Notes

- Lot metadata is bundled locally in app assets.
- Live occupancy comes from backend APIs + websocket events.
- Background parking events should still result in backend session writes and occupancy updates.
