# ScarletSpots (Original README, Pre-Pivot)

> **Source**: Commit `f5465d3` — "docs: add PLAN.md, readme2.md and update README.md" (Feb 14, 2026)
> **Status**: Historical archive. The project was originally a web prototype (React/Vite) before
>            pivoting to a native mobile app (Expo React Native).

---

This repo contains the native mobile project plan for ScarletSpots. It targets iOS and Android via Expo, with a FastAPI + PostGIS backend and Supabase for auth and realtime.

## Highlights
- Dual-map strategy with Apple Maps on iOS and Google Maps on Android
- Intelligent parking detection with geofences and motion cues
- Knight Needle compass for close-range navigation
- Snap-to-spot flow with user confirmation and GPS drift tolerance
- Heat map overlays for full areas inside lots
- Rush-hour prediction based on historical occupancy patterns
- Social features with friends and friend-spot highlighting
- Two themes: Campus (default) and Knight (retro)

## Scope Notes
- ScarletSpots Premium (ticket reporting and enforcement insights) is explicitly future-only and not in scope until core features are complete.

## Files
- [PLAN.md](PLAN.md) for the full implementation blueprint
