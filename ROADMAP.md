# ScarletSpots — Roadmap

---

## Phase 1 — Architecture Pivot ✅

**Goal:** Replace database-first lot architecture with bundled static JSON.

- [x] Copy `rutgers_parking_data.json` into `mobile/data/`
- [x] Create `mobile/data/lots.ts` — typed wrapper, NB campus filter, `ENABLE_ALL_CAMPUSES` feature flag
- [x] Remove all `GET /lots` and `GET /lots/{id}` API calls from mobile
- [x] Simplify `backend/app/routers/lots.py` — remove admin CRUD, keep forecast + occupancy
- [x] New migration: drop `parking_lots`, `occupancy_logs`, PostGIS. Create `lot_occupancy (TEXT, INT)`
- [x] Update `GeofenceManager.ts` to use static lot coordinates (no API)
- [x] Simplify `KnightCompass` / navigate tab to look up lot from JSON by `lot_id`
- [x] Wire Realtime subscription on `lot_occupancy` table (was on `parking_lots`)

**Exit criteria:** Map loads with 193+ NB lots, no `/lots` API call on startup.

---

## Phase 2 — Core Fixes ✅

**Goal:** Fix all known incomplete or broken flows before any new features.

- [x] Password reset: `POST /users/password-reset` + mobile forgot-password screen with resend cooldown
- [x] Active session banner: replaced with subtle floating chip above tab bar
- [x] Compass simplification: bearing + distance only, no proximity state machine
- [x] Friends "Locate" button: wired to navigate to Map tab at friend's lot
- [x] Crash audit: removed periodic location broadcast loop (was firing every 10s when focused). Fixed Realtime subscription cleanup on unmount.
- [x] Offline UX: map always loads (data is local). OfflineBanner redesigned to be subtle. Offline message updated to reflect new architecture.

**Exit criteria:** No known crashes. All navigation flows complete. App usable fully offline (map + cached session).

---

## Phase 3 — Forecasting ✅

**Goal:** Replace the heuristic forecast with a real trained model.

- [x] `MLForecastProvider` — loads per-lot models from `forecast_models/*.joblib`, falls back to heuristic
- [x] `train_forecast_model.py` — training script that queries `parking_sessions` and builds gradient boosting models
- [x] `POST /park/session/feedback` — users can correct detection quality, feeds future model tuning
- [x] `session_feedback` migration

**Deployment:** Launch with heuristic. After 2–4 weeks of session data, run `python -m app.services.train_forecast_model`. Models appear automatically.

**Exit criteria:** `GET /lots/{lot_id}/forecast` returns sensible predictions with confidence bands.

---

## Phase 4 — UI/UX Upgrade

**Goal:** Take the visual design to the next level. Only after core is stable.

- [x] Map redesign: richer lot cards, better occupancy color encoding, color-coded markers (green/yellow/red)
- [x] Parking confirmation UX pivot: precise-location auto-start + correction path ("Detected parked; if wrong, End")
- [x] Friends tab: richer friend cards with lot info, campus indicator
- [x] Profile: full settings, data export

**Exit criteria:** App looks beautiful. UX is delightful. Ship.

---

## Phase 5 — Launch Readiness ✅ (partial)

- [x] Bundle ID fixed: `com.scarletspots.app` (was `com.anonymous.mobile`)
- [x] EAS build config: development, preview, production profiles
- [x] GitHub Actions CI: backend pytest, mobile TypeScript check, migration syntax
- [ ] Load test: simulate 50k users at 3 calls/day peak (k6 or locust)
- [ ] App Store: configure `apple.com` App Review notes, screenshots
- [ ] Privacy Policy: publish at `scarletspots.app/privacy`
- [ ] Staged rollout: internal alpha → Rutgers student beta → public App Store

---

## Backlog (v2+)

These are real ideas, just not for v1:

- **Admin portal** (web): Occupancy dashboard, session monitoring, lot management — geofence editor with visual draw/edit of lot polygons, "Test Mode" to simulate entering/exiting geofences, user management (ban/unban)
- **Google OAuth**: Add as a sign-in option alongside email/password
- **Push notifications**: "Your lot is almost full" / "Your friend just parked nearby"
- **Account deletion**: Full GDPR-compliant flow (export + delete data)
- **All campuses by default**: Enable Newark, Camden, Piscataway in the main build
- **Permit validation**: Cross-reference Rutgers Parking Services data for permit type (✅ started — onboarding + profile screen added in Feb 2026)
- **Event integration**: Boost forecasts during football games, graduation, etc.
- **Friend markers on map**: Show pins where friends are parked (currently friends-tab only)
- **Common Commuter Spots database**: Pre-populate high-traffic Rutgers buildings (student centers, athletic facilities, lecture halls, admin buildings) for destination-based parking suggestions
- **Navigation hand-off**: Deep-link to Google Maps / Apple Maps for turn-by-turn directions to a parking lot
- **Heat map overlays**: Visualize per-lot density by zone (red = near-full sub-areas), updated in real-time from active sessions
- **Virtual Grid — Park Flow**: Geofence triggers session, accelerometer detects driving→walking transition, app highlights 3 closest plausible spots for confirmation
- **ScarletSpots Premium** (post-launch, monetization):
  - Ticket reporting system: report tickets with lot/time/date/agency
  - Real-time enforcement alerts for users currently parked in flagged lots
  - Enforcement analytics: identify lots and times with higher ticket activity
  - Parking recommendations based on enforcement risk
  - Subscription model (positioned as cheaper than a parking permit)
