# ScarletSpots — Future Features

This document tracks features that have been **explicitly approved for a future phase** during architecture planning sessions. These are real, technically scoped ideas — not just wishlist items.

---

## 🗣️ Siri / App Intents Integration

**Why:** With the native Swift module foundation now in place, ScarletSpots can register `AppIntent` providers that Siri, Shortcuts, and Spotlight can invoke.

**Planned Intents:**
- `FindMyCarIntent` — "Hey Siri, where did I park?" → opens Dynamic Island compass
- `FindParkingIntent` — "Hey Siri, find me a spot" → returns nearest available lot by permit type
- `EndParkingIntent` — "Hey Siri, I'm leaving" → ends active session and vacates the spot
- `CheckLotIntent` — "Hey Siri, is Lot 40 full?" → returns live occupancy + forecast

**Implementation Notes:**
- Requires `AppIntents` framework (iOS 16+)
- Intents should return structured `IntentResult` with lot name, distance, and occupancy
- Live Activity can be pushed from `FindMyCarIntent` directly

---

## 🌧️ WeatherKit Lot Alerts

**Why:** Many Rutgers lots are uncovered (Lot 613, Lot 48, etc.). A user parked in an uncovered lot during a Rutgers campus weather event has 0 warning.

**Planned Behavior:**
- Monitor active parking session's lot with WeatherKit
- If precipitation, wind, or extreme temperature is forecast within 30 minutes:
  - Send a notification: *"⚠️ Lot 613 is uncovered. Snow expected in 20 min. Nearest covered option: Gateway Garage."*
- Must only fire if user has an active session AND the lot is tagged as uncovered in the metadata

**Implementation Notes:**
- `WeatherKit` framework (iOS 16+)
- Requires fetching from `WeatherService.shared`
- Lot `covered` field needs to be added to `rutgers_parking_data.json`
- Only trigger once per precipitation event (debounce)

---

## 🚗 CarPlay Dashboard

**Why:** High-intent users driving to campus would benefit enormously from a simplified lot heatmap directly on their car screen. This lets them decide which lot to target before they're already stuck in the lot.

**Planned UI:**
- Simplified campus map showing the 3–5 nearest lots
- Color-coded by occupancy (green / yellow / red)
- Tap a lot → start navigation in Apple Maps / Google Maps
- Dynamic Island shows active session while in CarPlay mode

**Implementation Notes:**
- Requires `CarPlay` framework entitlement (paid Apple developer program tier)
- Must use `CPMapTemplate` or `CPPointOfInterestTemplate`
- Should NOT require the user to interact with the phone once navigation starts

> [!IMPORTANT]
> CarPlay app requires a separate App Store category approval ("Parking" is an allowed CarPlay category). Plan for 2–4 week review cycle.

---

## 📲 App Clips (The "Guest" Experience)

**Why:** A visitor to Rutgers campus has never heard of ScarletSpots. They scan a QR code on a parking lot sign and get a mini parking assistant instantly — no App Store, no download.

**Planned Behavior:**
- QR code placed at lot entrances links to `appclips.scarletspots.app/lot/{lot_id}`
- App Clip loads (~5MB max): shows the lot name, current occupancy, and permit rules
- One-tap "Start Session" with Apple Sign-In
- After 8 hours, the App Clip session expires and the user gets a prompt to download the full app

**Implementation Notes:**
- App Clip target in Xcode requires separate bundle (`com.scarletspots.app.Clip`)
- Needs Apple App Site Association (AASA) file on `appclips.scarletspots.app`
- Location permission and Supabase auth must work from App Clip context

---

## 📊 Parking Enforcement Intelligence (Premium)

**Why:** Rutgers campus has uneven ticket enforcement. A Commuter permit parked in the wrong lot at the wrong time has a ~30% ticket rate. This is a known, painful problem.

**Planned Features:**
- **Ticket Report Database:** Users can report a ticket (lot, time, date, permit type, amount)
- **Enforcement Heatmap:** Color overlay on the map showing "high enforcement risk" periods per lot
- **Smart Parking Suggestion:** When user opens the app near a flagged lot, surface a warning: *"This lot has 3x average tickets on Tuesday mornings."*
- **Premium Tier:** Position as a subscription (cheaper than the ~$90 Rutgers parking permit)

**Implementation Notes:**
- Requires new `ticket_reports` Postgres table
- Enforcement risk score = weighted average of f(reports, time_of_day, day_of_week)
- Must include moderation layer to filter fraudulent reports

---

## 🏙️ Multi-Campus Expansion

**Status:** Feature flag `EXPO_PUBLIC_ENABLE_ALL_CAMPUSES` already exists.

**Remaining Work:**
- Newark and Camden lot polygon data needs to be sourced and added to `rutgers_parking_data.json`
- Per-campus permit mapping needs to be added to `permit_mapping.json`
- Backend forecast models need per-campus training data
- UI needs a campus switcher on the map

---

## 🧠 Pedometer Step-Count Fusion (CMPedometer)

**Why:** One of the identified edge cases in the native sensing engine is the "Passenger Problem" — if a friend drops you off, Core Motion still sees `Automotive → Walking` and could trigger a false park. Step-count fusion can reduce this.

**Planned Logic:**
- On `motion_activity` trigger:
  - Read `CMPedometer.queryPedometerData` for the last 60 seconds
  - If step count > 15: high confidence (user just walked away from a car)
  - If step count < 5: low confidence (passenger scenario — prompt for confirmation instead of auto-starting)

**Implementation Notes:**
- `CMPedometer` is part of `CoreMotion` — no new permissions required
- Only relevant for the `motion_activity` source event, not `bluetooth_disconnect` (which is already high-confidence)

---

## 🔒 Full GDPR / Data Export Flow

- **Account deletion:** Full cascade delete of `parking_sessions`, `session_feedback`, `device_push_tokens`, `friendships`, `profiles`
- **Data export:** `GET /users/me/export` → JSON archive of all personal data
- **Push token cleanup:** On deletion, mark all device tokens as inactive immediately

---

*Last Updated: Phase 6 "Native Magic Pivot" — April 2026*
