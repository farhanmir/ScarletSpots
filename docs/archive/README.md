# docs/archive — Historical Documentation

This folder contains documentation files recovered from git history before the major architecture
pivot (Feb 2026). The project started as a web prototype (React/Vite/Figma Make) and pivoted to
a native mobile app (Expo React Native).

## Files

| File | Original Path | Commit | Description |
|------|--------------|--------|-------------|
| `PLAN_v1_original.md` | `PLAN.md` | `f5465d3` (Feb 14) | Original full feature blueprint — native mobile plan with all v1 + future features |
| `README_v1_original.md` | `README.md` | `f5465d3` (Feb 14) | First README — highlights the native mobile pivot plan |
| `readme2_web_prototype.md` | `readme2.md` | `f5465d3` (Feb 14) | Web prototype README from the Figma Make / React phase |
| `ATTRIBUTIONS.md` | `ATTRIBUTIONS.md` | `f5465d3` (Feb 14) | Attributions for the web prototype (shadcn/ui, Unsplash) |

## What Happened

1. **Feb 14, 2026** — Project started as a Figma Make web prototype (React + Leaflet + KV store).
   `readme2.md` documents that phase.

2. **Feb 14, 2026 (same day)** — Decision made to go native (Expo React Native + FastAPI + PostGIS).
   `PLAN.md` was written documenting the full native vision with features like heat maps,
   virtual grid, Knight Mode theme, Bluetooth detection, and ticket reporting Premium.

3. **Feb 14–27, 2026** — Major architecture pivot: dropped PostGIS and the `parking_lots` DB table,
   bundled lot data in-app as `rutgers_parking_data.json`. Several planned features were
   deferred to v2 or dropped entirely. All old docs were accidentally deleted in this process.

4. **Feb 28, 2026** — Parking permit integration added.

See `docs/CHANGELOG_DOCS.md` for a detailed breakdown of what was preserved, what changed,
and what features need to be tracked going forward.
