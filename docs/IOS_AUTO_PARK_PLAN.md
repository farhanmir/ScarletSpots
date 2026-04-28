# iOS Auto-Start/Auto-End Parking Sessions — Plan

## Goal
Make parking sessions start and end reliably for other users to see (friend notifications, permit checks), even when the app is not running — while respecting iOS platform limits and user privacy.

## High-level approach (server-first)
- Server is the source of truth for `ParkingSession` states.
- Devices supply high-confidence events when available (geofence, significant-change, Visits, Bluetooth disconnects) and periodic heartbeats while app is running.
- External sensors (gate, LPR, payment provider, parking sensors, telematics) provide authoritative events when the app is closed/force-quit.
- When only weak signals exist, server performs inference with TTLs and confidence levels and exposes `confirmed` vs `inferred` states in the UI.

## Constraints (iOS-specific)
- A user force-quit blocks most background relaunches and silent pushes; do not rely on the app process to auto-start after a force-quit.
- Only Apple/system apps can access certain OS-managed aggregates (e.g., Maps’ parked-car heuristics). Third-party apps must request explicit permissions and cannot replicate privileged behavior.
- Background modes are limited and must match legitimate use-cases (location, VoIP, audio, etc.). Even with `Always` location permissions, behavior can be throttled by the OS for battery reasons.

## Data sources (ordered by reliability)
1. Gate sensors / ticketing events (webhook) — highest confidence.
2. LPR (license plate recognition) camera events — high confidence when plate → user mapping exists.
3. Parking payment providers / barrier payments — high confidence.
4. In-ground parking sensors / garage IoT feeds — high confidence.
5. Telematics / car SDKs (connected car) — high confidence if user grants access.
6. Device-based signals: geofence enter/exit, Significant Location Changes, `Visits` API, Bluetooth disconnect (car), speed < threshold — medium confidence.
7. Last-known location + inactivity TTL — low-confidence inference used only when no better signal exists.

## Server model (example fields)
- ParkingSession: `id, user_id, lot_id, start_time, end_time, source, source_id, status, location_point, confidence_score, device_id, created_at, updated_at`
- Keep `source` in {gate, lpr, payment, sensor, telematics, device, inferred}.
- Maintain audit trail for reconciliation and UI transparency.

## Confidence & TTL rules (suggested)
- Confirmed event (gate/LPR/payment): confidence=0.99 → session starts immediately.
- Device enter with speed < 3 m/s: confidence=0.9 → session starts if within lot polygon.
- Bluetooth car disconnect + location inside lot: confidence=0.85.
- Last-known-location in lot + no heartbeat for 15–30 minutes: create inferred session with confidence=0.5; close after inactivity TTL (e.g., 4 hours) unless confirmed.

## Client-side (iOS) recommendations
- Request `Always` location permission with clear UX explaining parked-car benefits.
- Register geofences for lot polygons (avoid too many geofences; use clustering/priority for nearby lots).
- Use `CLLocationManager` Significant Location Change and `Visits` for low-power wake-ups.
- Use Bluetooth detection when pairing to car or when a compatible beacon is present: treat disconnects as a potential parked event.
- While app in foreground/background (not force-quit): send heartbeat every 1–5 minutes (adaptive) with `lat/lon`, speed, and event tags; keep payload small.
- On app resume/open: reconcile server session state and upload cached traces if user permits.

## Handling force-quit / app not opened
- Do not expect the app to run after a user force-quit; instead rely on external integrations (gate/LPR/payment) and server inference rules.
- Where you control infrastructure (parking lots), implement webhooks from gate controllers, payment processors, or LPR feeds to map events to users/lots.
- For public parking without sensors, use conservative inference from last-known device location + TTL and mark sessions as `inferred`.

## Notification rules and delivery
- Server evaluates rules when a session is created/updated:
  - Friend nearby: if friend opted-in and `session.lot_id` overlaps friend’s saved lots or within X meters → send push.
  - Permit violation: if user’s permit does not cover `lot_id` or time window → send push to user and optionally to enforcement.
- Use APNs visible notifications for user-facing alerts (these arrive even when app not running). Do not assume silent pushes will wake app after force-quit.
- Include deep links and minimal action payloads; set TTL/expiration and collapsible keys to avoid spam.
- Rate-limit and batch friend notifications (e.g., group multiple friends into a single message or debounce within a short window).

## Privacy and opt-in
- Require explicit opt-in for location-based sharing and friend notifications; provide granular controls (auto-share on/off, share-with-friends-only, allow inference).
- Store minimal location history needed for inference; allow users to delete traces and turn off auto-detection.
- Document retention policy and explain confidence levels in the UI: show `Confirmed` vs `Inferred` badges and an action to "Report incorrect".

## UI / UX notes
- Show parked sessions with `confidence_score` and `source` tag.
- Let users correct or confirm inferred sessions and use that feedback to improve heuristics.
- Provide clear permission rationale screens for `Always` location and Bluetooth access; show expected battery impact.

## Testing & validation
- Create synthetic event generators for gate/LPR/payment webhooks to exercise server rules.
- Simulate device event replay (geofence enter/exit, Bluetooth disconnect, heartbeats) across different app states (foreground, background, killed) using Xcode simulators and real devices.
- Test force-quit behavior: verify that visible pushes reach device, and that server inference handles missing client events correctly.

## Rollout checklist (MVP order)
1. Implement `ParkingSession` server model + basic `/events` webhook endpoint.
2. Integrate with one authoritative external signal (e.g., gate or payment provider) for a pilot lot.
3. Build client geofence + heartbeat reporting and reconciliation endpoint; test while app is running.
4. Add notification rules for friends and permit checks, with APNs push delivery.
5. Implement inference TTLs and `inferred` session UI.
6. Expand external integrations (LPR, sensors) and tune confidence rules.
7. Add UX for permission education, privacy controls, and "report incorrect" workflow.

## Metrics to track
- Fraction of sessions `confirmed` vs `inferred`.
- Notification deliver & open rates for friend/permit alerts.
- False-positive rate (user reports incorrect parked location).
- Time-to-confirm (time between inferred start and external confirmation).

---

If you want, I can now:
- generate a SQL migration for the `ParkingSession` table, or
- produce the iOS client skeleton (Swift) with geofence + heartbeat code and permission flows.

Which would you like next?