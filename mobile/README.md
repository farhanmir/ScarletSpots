# ScarletSpots: Native Magic 🚀

A high-performance, native-first parking detection system for Rutgers University.

## ⚠️ Important: Development Builds Required
As of the **Native Magic Pivot**, this project uses custom Swift modules (`modules/parking-magic`). **Expo Go is no longer supported.**

To run the app:
1. Ensure you have a physical iOS device and an Apple Developer account.
2. Run `npx expo prebuild` to generate the native iOS project.
3. Run `npm run ios` (or `npx expo run:ios`) to build and deploy to your device.

## Core Features
- **Native Magic Sensing**: Instant hardware-layer arrival detection via Bluetooth, CarPlay, and Core Motion.
- **Native Vision Engine**: 120Hz Apple MapKit renderer with native polygon support.
- **Live Activities**: Real-time car finding on your Lock Screen.
- **Ticket Shield**: Proactive permit validation at the hardware layer.
- **Crowdsourced Occupancy**: Silent background sync using optimized APNs pushes.

## Environment variables

Create a `.env` file in `mobile/` (or copy from `.env.example`) with:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

These are required by `lib/supabase.ts` for authentication and API calls.

Also set `EXPO_PUBLIC_API_URL` to point to your FastAPI backend (default: `http://localhost:8000/api/v1`).

## Run locally

```bash
npm install
npx expo start
```
