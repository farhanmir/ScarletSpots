# Sponsored Restaurants: Change Log and Rollback Guide

This document lists exactly what was added for the sponsored restaurants feature and how to remove it cleanly later if needed.

## Scope of what was implemented

The following was added:

- New sponsor backend router and endpoints with fake seed data.
- Discover tab + sponsor detail UI in iOS.
- Sponsor map pins with anti-annoyance display rules.
- Sponsor analytics event tracking.
- Opt-in nearby sponsor notification flow with server-side caps.
- Profile/Settings toggle for sponsor notifications.

## Files changed for this feature

### Backend

- `backend/app/routers/sponsors.py` (new)
  - Sponsor data models (`Sponsor`, `SponsorHours`)
  - 4 fake sponsor records
  - `GET /api/v1/sponsors`
  - `GET /api/v1/sponsors/{sponsor_id}`
  - `POST /api/v1/sponsors/events`
  - `GET /api/v1/sponsors/report`
  - `GET /api/v1/sponsors/nearby-candidate`
- `backend/app/main.py`
  - Added sponsor router import and `app.include_router(sponsors.router, prefix=settings.API_V1_STR)`

### iOS

- `ios/ScarletSpots/Sources/Models/AppModels.swift`
  - Added `SponsorHours`, `Sponsor`, `SponsorsResponse`
  - Added `SponsorNotificationCandidateResponse`
  - Added `SponsorReportEvent`, `SponsorReportResponse`
- `ios/ScarletSpots/Sources/Services/APIs.swift`
  - Added `SponsorsAPI`:
    - `list(latitude:longitude:)`
    - `details(id:)`
    - `trackEvent(...)`
    - `nearbyNotificationCandidate(...)`
    - `report()`
- `ios/ScarletSpots/Sources/Views/DiscoverView.swift` (new)
  - Discover list + sponsor detail screen
  - Website/call/copy code/navigate actions
  - Impression and click tracking hooks
- `ios/ScarletSpots/Sources/Views/MainTabView.swift`
  - Added `DiscoverView()` tab
  - Shifted Profile tab tag from `3` to `4`
- `ios/ScarletSpots/Sources/Views/MapView.swift`
  - Sponsor pin rendering + sponsor detail sheet
  - Sponsor visibility constraints (zoom/proximity/state guards)
  - Sponsor event tracking from map interactions
  - Nearby sponsor notification candidate check + local alert/notification
  - Added opt-in key usage: `@AppStorage("sponsor_notifications_opt_in")`
- `ios/ScarletSpots/Sources/Views/SettingsView.swift`
  - Added sponsor notification opt-in toggle using `sponsor_notifications_opt_in`

## Important: what was NOT changed

- No DB migrations were created for sponsors.
- No Supabase table schema changes were made by this implementation.
- No parking lot static metadata flow was changed (bundled SQLite remains intact).

## Fast rollback (if changes are uncommitted)

Run this from repo root:

```bash
git restore "backend/app/main.py" "ios/ScarletSpots/Sources/Models/AppModels.swift" "ios/ScarletSpots/Sources/Services/APIs.swift" "ios/ScarletSpots/Sources/Views/MainTabView.swift" "ios/ScarletSpots/Sources/Views/MapView.swift" "ios/ScarletSpots/Sources/Views/SettingsView.swift"
git clean -f "backend/app/routers/sponsors.py" "ios/ScarletSpots/Sources/Views/DiscoverView.swift" "docs/SPONSORED_RESTAURANTS_CHANGELOG_AND_ROLLBACK.md"
```

Notes:
- `git restore` resets modified tracked files.
- `git clean -f` removes new untracked files.

## Rollback after commit/merge

Preferred safe path:

1. Find commit(s) that introduced sponsorship:
   - `git log --oneline -- backend/app/routers/sponsors.py ios/ScarletSpots/Sources/Views/DiscoverView.swift`
2. Revert commit(s):
   - `git revert <commit_sha>`
3. Resolve conflicts if any, then run tests/build and commit the revert.

## Manual code removal checklist (non-git fallback)

If you need to remove by hand:

1. Delete files:
   - `backend/app/routers/sponsors.py`
   - `ios/ScarletSpots/Sources/Views/DiscoverView.swift`
2. In `backend/app/main.py`:
   - Remove `sponsors` from router imports.
   - Remove `app.include_router(sponsors.router, prefix=settings.API_V1_STR)`.
3. In `ios/ScarletSpots/Sources/Views/MainTabView.swift`:
   - Remove `DiscoverView()` tab block.
   - Set Profile tab tag back to `3`.
4. In `ios/ScarletSpots/Sources/Models/AppModels.swift`:
   - Remove sponsor-related model structs listed above.
5. In `ios/ScarletSpots/Sources/Services/APIs.swift`:
   - Remove `SponsorsAPI` enum.
6. In `ios/ScarletSpots/Sources/Views/MapView.swift`:
   - Remove sponsor state, loading logic, pin annotations, sponsor sheet, notification logic, helper views (`SponsorPin`, `MapSponsorDetailSheet`), and `@AppStorage("sponsor_notifications_opt_in")`.
7. In `ios/ScarletSpots/Sources/Views/SettingsView.swift`:
   - Remove sponsor notifications toggle and related `@AppStorage`.

## Post-rollback verification

After rollback, verify:

- Backend starts without import errors.
- iOS builds successfully.
- Tab bar only has Search/Map/Friends/Profile.
- No references remain to:
  - `/sponsors`
  - `SponsorsAPI`
  - `Sponsor` model types
  - `sponsor_notifications_opt_in`

Useful check:

```bash
rg "SponsorsAPI|/sponsors|sponsor_notifications_opt_in|DiscoverView|SponsorPin|MapSponsorDetailSheet" ios backend
```

If this search returns no sponsorship references (besides historical docs/commits), rollback is complete.
