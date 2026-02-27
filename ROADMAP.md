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

This phase is intentionally left vague — design decisions happen when core is solid.

- [ ] Map redesign: richer lot cards, better occupancy color encoding
- [ ] Parking confirmation sheet: polish candidate flow
- [ ] Compass redesign: make the needle beautiful (the "Knight Needle" vision)
- [ ] Friends tab: richer friend cards with lot info, campus indicator
- [ ] Profile: full settings, data export, account deletion flow

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

- **Admin portal** (web): Occupancy dashboard, session monitoring, lot management
- **Google OAuth**: Add as a sign-in option alongside email/password
- **Push notifications**: "Your lot is almost full" / "Your friend just parked nearby"
- **Account deletion**: Full GDPR-compliant flow (export + delete data)
- **All campuses by default**: Enable Newark, Camden, Piscataway in the main build
- **Permit validation**: Cross-reference Rutgers Parking Services data for permit type
- **Event integration**: Boost forecasts during football games, graduation, etc.
