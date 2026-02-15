# ScarletSpots - Product Experience Blueprint (Production Canon)

## Purpose
This document is the implementation reference for how ScarletSpots should behave as a fully shipped product for 100k users.

It defines:
- exact user journeys (tap-by-tap),
- expected states and transitions,
- edge-case handling,
- long-term user lifecycle behavior,
- strict UX and reliability standards,
- and critical implementation corrections versus current behavior.

Use this with PLAN.md and ROADMAP.md.

---

## 1. Product Principles (Non-Negotiable)
1. Reliable first: user trust is more important than feature count.
2. No silent failures: every error has a clear fallback path.
3. Privacy by default: no sharing unless explicit and revocable.
4. Fast context switching: users can park or find in under 10 seconds.
5. Long-term consistency: app must remain dependable for daily users over years.

---

## 2. Primary User Types and Their Daily Reality

### A. Daily Commuter (Core user)
- Opens app 2-4 times/day.
- Needs fast lot confidence + quick park confirmation.
- Returns hours later and expects precise car recovery.

### B. First-Time User
- Needs immediate clarity, low friction onboarding.
- Must understand permission prompts and value in < 60 seconds.

### C. Social User
- Wants friend visibility but with strict control.
- Expects per-friend privacy settings.

### D. Admin/Operations User
- Needs accurate geofences, occupancy monitoring, and system health.

---

## 3. End-to-End User Journey (Perfect Flow)

## 3.1 First Launch
### Screen: Splash
- App validates remote config and API health in background.
- If backend unavailable: show graceful degraded mode message + retry.

### Screen: Welcome / Value framing
Buttons:
- Get Started
- Learn How It Works

Tap behavior:
- Get Started -> Auth Choice screen.
- Learn How It Works -> short walkthrough, then Auth Choice.

### Screen: Auth Choice
Buttons:
- Continue with Rutgers Email
- Continue with Google Rutgers (OAuth)
- Already have account? Sign In

### Sign Up Path (Email)
Inputs:
- Rutgers email
- Password
- Confirm password
- Display name

On tap Create Account:
1. Client validates format and password rules.
2. Backend enforces Rutgers domain whitelist.
3. Account created + verification state resolved.
4. Success -> Permissions Intro.

Failure states:
- invalid domain -> clear policy error
- weak password -> exact requirement
- duplicate account -> recover/sign in prompt
- backend timeout -> retry CTA with preserved inputs

### Sign In Path
Inputs:
- Email
- Password

Actions:
- Sign In
- Forgot Password

Forgot Password:
- Enter email -> send reset email -> confirmation screen
- If delivery delayed, show resend cooldown and support route

---

## 3.2 Permissions Flow

### Permissions Intro
Explains why each permission is needed:
- location always/while using,
- motion sensors,
- notifications.

Buttons:
- Continue
- Not Now (limited mode)

### Location Request
Outcomes:
- granted -> Motion Request
- denied once -> explain impact + re-request path
- denied permanently -> open system settings + post-return recheck

### Motion Sensor Request (if required by OS)
- granted -> Notification Request
- denied -> app runs with reduced detection confidence

### Notifications Request
- granted/denied both acceptable
- if denied, surface in settings with clear value proposition

Completion:
- enters main map with onboarding hints

---

## 3.3 Main Navigation Model
Bottom tabs:
- Map
- Search
- Navigate
- Friends
- Profile

Global behavior:
- Active parking session banner appears in all relevant tabs.
- Session state survives app restart and network loss.
- Pending actions are queued when offline and replayed safely.

---

## 3.4 Map Tab (Core)

### Default State (No active session)
Visible:
- user location marker
- lot overlays and occupancy state
- search affordance
- quick filters (All, Permit-safe, Busy, Full, Friends)
- destination chip (if selected)

Tap interactions:
- Tap lot marker -> lot bottom sheet opens
- Tap map background -> close sheet
- Tap search icon -> Search tab with query focus

### Lot Bottom Sheet
Shows:
- lot name/campus
- current occupancy
- forecast strip now/+15/+30/+60
- permit/risk warning text
- actions:
  - Navigate to lot
  - Park Here
  - Save as Favorite
  - Report Issue

Park Here action:
- opens spot confirmation UI with top 3 suggestions
- user picks one or manually adjusts pin
- confirm starts session

### With Active Session
Top banner:
- Parked at Lot X Spot Y
Buttons:
- Find My Car -> Navigate tab
- End Session

End Session flow:
- confirm modal (prevent accidental end)
- optional reason for analytics (left lot, wrong spot, duplicate)
- success toast + map state reset

---

## 3.5 Search Tab

Modes:
1. destination search (buildings/common locations)
2. lot search
3. history/favorites quick launch

Tap result behavior:
- Destination result -> returns to Map with destination chip and recommended lots highlighted.
- Lot result -> map centers lot and opens lot sheet.

No-result behavior:
- offer nearest known locations
- typo suggestions

---

## 3.6 Navigate Tab (Find Car Experience)

Entry states:
- from active session -> target is parked car
- from map destination -> target is lot/destination

Distance-based UI:
- >500 ft: map + directional guidance + distance
- <=500 ft: auto switch to compass mode with user override

Compass mode:
- center lance rotates toward target
- heading smoothing to avoid jitter
- haptic lock on threshold crossing
- proximity states:
  - Far
  - Near
  - Very Close
  - Arrived

Failure states:
- no active session -> clear CTA to park first
- heading unavailable -> fallback to map navigation
- location stale -> force refresh prompt

---

## 3.7 Friends Tab

Sections:
- Incoming requests
- Outgoing requests
- Friends list
- Blocked list

Per friend controls:
- share my live parking: on/off
- show in same lot only: on/off
- mute notifications
- remove friend
- block user

Friend map behavior:
- show marker only if both relationship accepted and sharing enabled
- if same-lot-only enabled, hide outside lot context

---

## 3.8 Profile Tab

Includes:
- account info
- vehicle profiles
- favorites and recents
- privacy settings
- permission status center
- notifications preferences
- battery optimization guidance
- export/delete data
- sign out

---

## 3.9 Admin Web Portal

### Dashboard
- live sessions by lot
- heatmap freshness
- forecast error monitor
- API latency and error panel

### Geofence Management
- draw/edit polygons
- validate shape quality
- version history + rollback
- simulation mode for geofence enter/exit

### User and Safety Ops
- search users
- suspend/unsuspend
- review abuse flags
- audit logs

---

## 4. Year-Long User Lifecycle (Daily User for 12 Months)

## Month 1
- onboarding, permission tuning, trust building
- learns favorites and routine routes

## Months 2-4
- relies on auto detection and friend sharing
- expects consistent lot predictions and quick find-car

## Months 5-8
- seasonal shifts in parking demand
- user expects model adaptation and reliable alerts

## Months 9-12
- account maturity features matter:
  - robust history,
  - privacy confidence,
  - data controls,
  - stable battery behavior,
  - no regressions.

Long-term requirements:
- migration-safe settings persistence
- no notification spam drift
- no session corruption after app updates
- transparent privacy controls always discoverable

---

## 5. Full State Matrix (Critical Paths)

## Session State
- none
- candidate_detected
- awaiting_confirmation
- active
- ending
- ended
- recovery_required

Transitions must be deterministic and idempotent.

## Network State
- online
- degraded
- offline

Rules:
- user intent actions queue offline and replay with conflict resolution
- never lose user-confirmed spot updates

## Sensor State
- full (location+motion+heading)
- partial
- unavailable

Rules:
- degrade gracefully and label confidence visibly

---

## 6. Error and Recovery Behavior (Must Exist)

### Auth Errors
- token expired -> silent refresh once, then controlled re-auth
- 401 loops prevented with bounded retries

### API Errors
- display plain-language explanation + retry
- preserve user input in forms

### Geolocation Failures
- explain likely causes (permissions, GPS off, OS battery restrictions)
- one-tap help to settings

### Data Conflicts
- stale session conflict -> user chooses keep local or server version

### Crash Recovery
- relaunch restores last known user state and pending intents

---

## 7. Current Implementation Logic Audit (Strict)

## A. Critical Logic Gaps
1. Route consistency failure in admin links.
   - Why current approach is bad: user clicks can dead-end or hit wrong screen.
   - Better: route constants, typed path helpers, navigation tests.

2. Hardcoded mobile backend credentials/config.
   - Why bad: rotation risk, environment drift, accidental leakage.
   - Better: env-based config pipeline, build-time validation, runtime sanity checks.

3. Placeholder password reset.
   - Why bad: account lockout risk and support burden.
   - Better: full reset lifecycle with resend throttles and success verification.

4. API and domain architecture mismatch with production plan.
   - Why bad: difficult scaling and unclear ownership boundaries.
   - Better: FastAPI service layer + PostGIS source of truth + queue-backed jobs.

5. Friends visibility lacks complete privacy controls.
   - Why bad: user trust/privacy exposure risk.
   - Better: per-friend sharing toggles, explicit policies, audited visibility checks.

## B. Product Logic Gaps
1. No complete detection state machine.
   - Why not implemented likely: prototype-first manual flow focus.
   - Better for users: auto detect + confidence-driven prompt reduces friction.

2. Compass uses simplified heading flow.
   - Why bad: jitter and unreliable close-range guidance.
   - Better: magnetometer fusion + smoothing + lock-on haptics.

3. Heatmap and forecasting are placeholders.
   - Why bad: users cannot trust demand guidance.
   - Better: freshness-backed occupancy pipeline and measured forecast quality.

4. Admin analytics mostly static.
   - Why bad: operations cannot detect incidents early.
   - Better: real telemetry with alert thresholds and drill-downs.

---

## 8. UX Details: Tap-by-Tap Requirements by Feature

## 8.1 Tap Park Here
1. User taps lot marker.
2. Sheet opens with occupancy and forecast.
3. User taps Park Here.
4. Candidate spots UI opens (3 ranked options + manual adjust).
5. User selects/adjusts.
6. User taps Confirm.
7. Session enters active state, map banner appears, navigate target set.

## 8.2 Tap Find My Car
1. User taps Find My Car from banner.
2. App opens Navigate tab.
3. If >500ft map guidance shown.
4. At <=500ft auto-switch to compass.
5. Haptic on lock-on.
6. Arrival state confirms user is at spot.

## 8.3 Tap Add Friend
1. User enters Rutgers email.
2. Request sent with pending state.
3. Recipient sees incoming request.
4. On accept, both sides get friendship record.
5. Sharing remains OFF until explicit toggle ON.

## 8.4 Tap End Session
1. User taps End.
2. Confirmation modal appears.
3. Optional reason selection.
4. On confirm, backend finalizes session and occupancy updates.
5. UI returns to no-active-session state.

---

## 9. Accessibility and Inclusivity Requirements
- All tap targets >= 44x44 px.
- Color is not sole indicator for occupancy states.
- Screen-reader labels for all controls.
- Dynamic text sizing support.
- Haptic/sound cues must have alternatives.

---

## 10. Notification Design (No Spam Policy)

Types:
- parking detected confirmation prompt
- end-of-session reminder
- high-confidence lot availability alert (opt-in)
- friend request and acceptance

Rules:
- quiet hours support
- digest options for low-priority events
- strict opt-in categories

---

## 11. Data Retention and History UX
- Session history timeline with search/filter.
- Ability to edit incorrect historical spots (with audit note).
- Data export and account deletion pathways.
- Clear retention policy in-app.

---

## 12. Canonical Acceptance Scenarios (Must Pass Before Launch)
1. New user completes onboarding and parks within 2 minutes.
2. Returning user can find car from lock screen notification path.
3. User with denied permissions can recover without support.
4. User offline during park confirmation syncs correctly later.
5. Friend sharing enabled for one friend and disabled for another works exactly.
6. Prediction endpoint degradation falls back to baseline without UI break.
7. Admin can revert bad geofence change in under 1 minute.
8. Password reset flow works end-to-end reliably.

---

## 13. Governance
- Any implementation that diverges from this document requires explicit architecture review and updated acceptance criteria.
- This blueprint is binding for product, design, backend, mobile, web, QA, and operations.
