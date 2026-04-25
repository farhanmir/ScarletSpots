# ScarletSpots Release Readiness

This document closes the remaining v1 launch-readiness checklist items from `ROADMAP.md`.

## App Review Notes Template

Use this text in App Store Connect review notes and update values before submission.

- App: ScarletSpots (`com.scarletspots.app`)
- Audience: Rutgers students and commuters.
- Core behavior: User starts/ends parking sessions; occupancy is crowd-sourced in near real time.
- Background behavior:
  - Location and motion are used to detect likely parking transitions.
  - Bluetooth route-change signals may contribute to confidence scoring.
  - Background notifications sync occupancy/session state.
- Data minimization:
  - Static lot geometry is bundled in-app.
  - Backend stores only dynamic session/occupancy/social state.
- User controls:
  - Permissions are optional and can be disabled in settings.
  - Session actions can still be performed manually.
  - Data export and account deletion endpoints are available.

## Screenshot Plan (iPhone)

Capture and upload at minimum:

1. Map with color-coded occupancy.
2. Lot detail card with live count and confidence.
3. Parked session chip and quick actions.
4. Compass/navigation to parked lot.
5. Friends tab with lot-only friend presence.

Optional:
- Offline banner/map loaded offline.
- Forecast chart and confidence bands.

## Staged Rollout Plan

1. Internal alpha (`build train A`)
   - Team devices only.
   - Verify auth, parking session lifecycle, occupancy sync, push token sync.
2. Rutgers student beta (`build train B`)
   - 20-50 testers for 2 weeks.
   - Track crash-free sessions, false-positive rate, battery impact.
3. Public App Store launch (`build train C`)
   - Monitor backend saturation, push queue latency, feedback quality.

## Manual Pre-Ship Checklist

- [ ] Apple Developer certificates/profiles valid.
- [ ] App Store Connect metadata finalized.
- [ ] Screenshots uploaded for required device classes.
- [ ] Privacy policy URL points to `https://scarletspots.app/privacy.html`.
- [ ] Terms URL points to `https://scarletspots.app/terms.html`.
- [ ] Review notes pasted and updated for current build behavior.
- [ ] TestFlight feedback triaged for blocking bugs.
- [ ] Rollback and hotfix path documented.

## Load Test Gate

- Target: 50k users at 3-4 calls/day with peak burst handling.
- Script location: `backend/loadtests/occupancy_peak.js`.
- Success criteria:
  - error rate < 1%
  - p95 latency under agreed threshold
  - no data integrity regressions in occupancy/session writes
