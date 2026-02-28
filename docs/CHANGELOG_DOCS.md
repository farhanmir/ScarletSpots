# ScarletSpots — Documentation Changelog

> This file documents the history of the project's documentation, what features were in the
> original plan, what changed after the pivot, what was accidentally lost, and what has been
> recovered and added back.

---

## Summary

The project had a **major architecture pivot in late February 2026**. During that pivot, all old
documentation was accidentally deleted and replaced with a fresh set of docs describing the
post-pivot state. Many planned features from the original vision were never captured in the
new docs.

This file records what was recovered from git history and what was added to the current docs.

---

## Original Vision (Pre-Pivot, Feb 14, 2026)

The original `PLAN.md` and `readme2.md` captured a rich vision. Key features that were fully
planned but not present in the post-pivot docs:

### Features from original plan NOT in post-pivot docs (now restored):

| Feature | Where It Was | Status | Restored To |
|---------|-------------|--------|-------------|
| **Knight Mode theme** (dark map, 8-bit pixel lance, JetBrains Mono, Pip-Boy vibe) | `PLAN.md` §13 | Deferred to v2 | `ROADMAP.md` Phase 4 + Backlog |
| **Campus Mode theme** (white/black/scarlet, thin needle) | `PLAN.md` §13 | Current default (undocumented) | `ROADMAP.md` Phase 4 |
| **Compass haptic lock-on** ("haptic thud" when needle locks on target) | `PLAN.md` §5 | Deferred (compass simplified) | `ROADMAP.md` Phase 4 |
| **Heat map overlays** (per-zone lot density in red/scarlet) | `PLAN.md` §7 | Deferred to v2 | `ROADMAP.md` Backlog |
| **Rush-hour / timeline scrubber** (+15m, +30m, +60m forecast view) | `PLAN.md` §12 | Partially built as forecasting API | `ROADMAP.md` Backlog note |
| **Virtual Grid — Park Flow** (geofence + accelerometer → 3 closest spots suggestion) | `PLAN.md` §6 | Deferred | `ROADMAP.md` Backlog |
| **Auto-switch to compass at < 500 ft** ("Find Flow") | `PLAN.md` §6 | Deferred | `ROADMAP.md` Phase 4 |
| **Snap-to-spot drag-adjust** (GPS drift tolerance in confirmation sheet) | `PLAN.md` §3 | Deferred | `ROADMAP.md` Phase 4 |
| **Bluetooth-assisted detection** (car BT disconnect as parking signal) | `PLAN.md` §3 | Deferred | `ROADMAP.md` Backlog |
| **Common Commuter Spots database** (pre-mapped Rutgers buildings for destination parking) | `PLAN.md` §4 | Deferred | `ROADMAP.md` Backlog |
| **Navigation hand-off** (deep-link to Google Maps / Apple Maps) | `PLAN.md` §17 | Deferred | `ROADMAP.md` Backlog |
| **Friend parking spots on map** (pins for friends in same lot) | `PLAN.md` §8 | Deferred (friends tab only) | `ROADMAP.md` Backlog |
| **Admin portal** (geofence editor, live heatmap, user management) | `PLAN.md` §18 | In repo as `frontend/` (untouched) | `ROADMAP.md` Backlog (expanded) |
| **ScarletSpots Premium** (ticket reporting, enforcement analytics, subscription) | `PLAN.md` §16 | Post-launch only | `ROADMAP.md` Backlog |

### Feature that was implemented but NOT documented in post-pivot PLAN.md (now added):

| Feature | Where It Was Built | Added To |
|---------|-------------------|----------|
| **Parking Permit integration** | `mobile/app/onboarding/permit.tsx`, `AuthProvider`, `lots.ts` | `PLAN.md` "In for v1" section |

---

## What Was Removed in the Pivot (Intentionally)

These features were in the original plan but were explicitly cut or replaced during the pivot:

| Feature | Original Plan | Pivot Decision | Documented |
|---------|--------------|----------------|------------|
| `parking_lots` PostgreSQL table | Core DB table | Replaced by bundled JSON | ✅ PLAN.md |
| `occupancy_logs` table | Occupancy history | Replaced by `lot_occupancy` + sessions | ✅ PLAN.md |
| PostGIS extension | Server-side polygon checks | Client-side checks from JSON | ✅ PLAN.md |
| Web prototype (React/Vite/KV store) | First working prototype | Replaced by native Expo app | ✅ archived |
| Full-width session banner | Active session UI | Replaced by floating chip | ✅ PLAN.md |
| Compass proximity state machine | Haptic lock-on stages | Simplified to bearing+distance | ✅ PLAN.md |
| Friend pins on map | Friends visible as map markers | Friends tab only | ✅ PLAN.md |
| `event_logs` table | System event log | Not needed | ✅ PLAN.md |
| `friend_sharing_settings` table | Per-friend sharing config | Merged into `friendships.sharing_enabled` | ✅ PLAN.md |
| Redis caching | Occupancy caching | Not needed (static data is local) | ✅ PLAN.md |
| Background batch workers | Periodic occupancy jobs | Not needed (realtime push) | ✅ PLAN.md |

---

## What Was NOT in Original Docs But Was Built

These features were added during the pivot and implementation that weren't in the original plan:

| Feature | When Added | Where |
|---------|-----------|-------|
| Offline action queue (`OfflineQueue.ts`) | During pivot | `mobile/services/OfflineQueue.ts` |
| `session_feedback` table + endpoint | Phase 3 | `backend/app/routers/park.py` |
| ML forecast provider (`MLForecastProvider`) | Phase 3 | `backend/app/services/ml_forecast_provider.py` |
| `ENABLE_ALL_CAMPUSES` feature flag | Pivot | `mobile/constants/featureFlags.ts` |
| EAS build config | Phase 5 | `mobile/eas.json` |
| GitHub Actions CI pipeline | Phase 5 | `.github/workflows/ci.yml` |
| Parking permit onboarding + filtering | Feb 28 | `mobile/app/onboarding/permit.tsx` |
| `permit_mapping.json` data | Feb 28 | `mobile/data/permit_mapping.json` |

---

## Archive Files Created

All old documentation files have been preserved in `docs/archive/`:

| Archive File | Original File | Commit |
|-------------|--------------|--------|
| `docs/archive/PLAN_v1_original.md` | `PLAN.md` | `f5465d3` (Feb 14) |
| `docs/archive/README_v1_original.md` | `README.md` | `f5465d3` (Feb 14) |
| `docs/archive/readme2_web_prototype.md` | `readme2.md` | `f5465d3` (Feb 14) |
| `docs/archive/ATTRIBUTIONS.md` | `ATTRIBUTIONS.md` | `f5465d3` (Feb 14) |

---

## Current Doc Files and Their Purpose

| File | Purpose |
|------|---------|
| `README.md` | Project overview, quick-start, API reference, database tables |
| `PLAN.md` | Authoritative architecture contract — what we built, what we decided |
| `ROADMAP.md` | Phased roadmap — what's done, what's next, what's in the backlog |
| `ARCHITECTURE.md` | Technical deep-dive — data model, API contract, data flows |
| `SESSION_STATE.md` | AI handoff document — current state, decisions, env vars, how to continue |
| `docs/CHANGELOG_DOCS.md` | This file — documentation history and feature recovery log |
| `docs/archive/` | Preserved copies of all old documentation files from git history |
