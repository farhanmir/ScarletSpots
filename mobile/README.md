# ScarletSpots Mobile

## Purpose

Expo React Native app for Rutgers parking occupancy, sessions, and friend visibility.

## Environment Variables

Create `mobile/.env` with:

```bash
EXPO_PUBLIC_API_URL=http://localhost:8000/api/v1
EXPO_PUBLIC_ENABLE_ALL_CAMPUSES=false
EXPO_PUBLIC_LOGTO_ENDPOINT=http://localhost:3001
EXPO_PUBLIC_LOGTO_ISSUER=http://localhost:3001/oidc
EXPO_PUBLIC_LOGTO_APP_ID=your-logto-native-app-id
```

Auth direction is Logto-backed token flow through backend APIs.

## Run Locally

```bash
cd mobile
npm install
npx expo start
```

## Auth Notes

- Mobile should authenticate against Logto native app configuration.
- Backend protected routes require bearer access token.
- Keep app and issuer IDs aligned with the Logto tenant used by backend.

## Operational Notes

- Lot metadata is bundled locally in app assets.
- Live occupancy comes from backend APIs + websocket events.
- Background parking events should still result in backend session writes and occupancy updates.
