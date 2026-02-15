# ScarletSpots - Production Launch Plan (100k Users)

## Project Mandate
ScarletSpots is a production mobile parking platform for campus users, designed to operate reliably at large scale (target: 100,000 active users) with strong real-time behavior, strict privacy controls, and auditable operational readiness.

This is **not** an MVP/prototype plan. Every phase below is scoped for ship-quality delivery.

---

## 0. Product Targets and Service Levels

### Launch Targets
- Registered users: 100,000+
- Daily active users (DAU): 20,000+
- Concurrent active sessions at peak: 5,000+
- Geographic scope: Rutgers campuses (expandable)

### Service-Level Objectives (SLOs)
- API availability: 99.9% monthly
- p95 API latency:
  - Read endpoints: < 300 ms
  - Write endpoints: < 500 ms
- Real-time update delay (parking occupancy deltas): < 5 seconds (p95)
- Crash-free sessions:
  - iOS: 99.8%+
  - Android: 99.6%+

### Data and Detection Quality Targets
- Parked-car location median error: <= 15 meters
- “Find my car” successful return rate: >= 95%
- Heatmap state classification precision (low/med/high/full): >= 85%
- Forecast MAE (1 hour horizon occupancy): <= 12%

---

## 1. Production Architecture

### Mobile Client
- Expo (React Native) + TypeScript
- Maps: `react-native-maps`
  - iOS: Apple Maps (MKMapView)
  - Android: Google Maps
- Sensors:
  - `expo-location` (GPS/heading/geofencing)
  - `expo-sensors` (magnetometer + accelerometer)
  - Device motion fallback where available
- Notifications: Expo Push Notifications

### Backend and Data Platform
- API Layer: FastAPI (Python) for business logic and predictive endpoints
- Data Layer:
  - PostgreSQL + PostGIS (primary system of record)
  - Redis (caching, rate-limiting counters, short-lived session accelerators)
- Auth and Realtime:
  - Supabase Auth (session lifecycle)
  - Supabase Realtime subscriptions where appropriate
- Async Workloads:
  - Background worker(s) for ETL, feature generation, and prediction refresh
  - Queue system (Celery/RQ/Cloud-managed equivalent)

### Deployment Strategy
- Environment separation: `dev`, `staging`, `prod`
- Blue/green or rolling deploys with health checks
- Zero-downtime schema migration strategy
- Infrastructure as code (Terraform/Pulumi) for reproducibility

---

## 2. Dual-Map Strategy (Required)
Use `react-native-maps` provider auto-selection:
- Android -> `PROVIDER_GOOGLE`
- iOS -> `PROVIDER_DEFAULT`

Requirements:
- User location display enabled
- Marker clustering at scale
- Style parity across platforms where feasible
- Performance target: map interactions maintain 55+ FPS on modern devices

---

## 3. Intelligent Parking Detection System (Production)

### Objective
Automatically detect and log where users park with minimal manual friction and measurable confidence.

### Detection Pipeline (Multi-Signal)
1. **Geofence entry** starts candidate parking state.
2. **Rolling location buffer** captures pre/post stop trajectories.
3. **Transition detection** confirms drive -> stop -> walk using:
   - velocity profile,
   - accelerometer patterns,
   - heading/delta movement,
   - optional Bluetooth disconnect heuristics where accessible.
4. **Confidence scoring** combines signals into a deterministic score.
5. **User confirmation UI** appears only when confidence threshold is met.

### GPS Accuracy Compensation
- Incorporate horizontal accuracy into final pin confidence
- If accuracy is poor, snap to nearest plausible lot cell centroid
- Preserve “user-adjusted final pin” as truth label for future model tuning

### Operational Requirements
- Background-safe behavior with battery budget controls
- False positive/negative telemetry emitted for model tuning
- Feature flags for threshold tuning without app redeploy

---

## 4. Common Commuter Spots Database

### Objective
Provide pre-mapped high-traffic destinations and fast destination-to-parking workflows.

### Data Model
- `common_locations` with: id, name, category, building metadata, coordinates, campus
- Categories include student centers, athletics, classrooms, admin buildings, transit nodes

### Product Behavior
- Search and quick-select destinations
- Suggest nearest viable lots from destination
- User favorites + recents persisted per account

---

## 5. Knight Needle (Compass) - Production Spec

### Core Math
- `bearing = bearing(user, car)`
- `heading = heading_from_magnetometer`
- `rotation = normalize(bearing - heading)`

### UX Requirements
- Center scarlet lance
- Distance text + proximity states
- Haptic lock-on when entering threshold (e.g., <= 15m)
- Smooth, debounced rotation with sensor noise filtering

### Reliability Requirements
- Fallback if magnetometer unavailable (GPS heading + inertial smoothing)
- Explicit permission/error states
- Deterministic behavior under sensor jitter

---

## 6. Virtual Grid (Mobile Flow)

### Park Flow
- Geofence trigger -> candidate session starts
- Drive->walk transition detection
- Show top 3 plausible spots (ranked by confidence)
- User confirms/adjusts exact spot

### Find Flow
- Far distance: map guidance + pin
- Near distance (< 500 ft): auto-switch to compass mode
- State machine persisted across app restarts

### Required Persistence
- Session state, candidate pin, confidence, user override reason

---

## 7. Map Intelligence: Heatmap + Rush-Hour Prediction

### Heatmap
- Cell/zone density scoring using:
  - active sessions,
  - recent confirmations,
  - manual reports (weighted reliability)
- Recompute cadence:
  - hot zones: 1-2 min
  - background zones: 5-10 min
- Class labels: low / medium / high / full

### Prediction (1 hour horizon)
- Time slices: now, +15m, +30m, +60m
- Inputs:
  - historical occupancy,
  - current inflow/outflow,
  - day-of-week/hour effects,
  - event/calendar modifiers
- Outputs:
  - expected occupancy,
  - confidence band,
  - availability label

### Model Ops
- Offline backtesting before release
- Drift monitoring post-release
- Automatic rollback to baseline heuristic if model health degrades

---

## 8. Social and Friend Layer (Production)

### Required Features
- Email/password + OAuth via Supabase Auth
- Friend request lifecycle: pending, accepted, blocked
- Bidirectional friendship with explicit consent
- Per-friend location sharing toggle
- Friend parking markers on map with filter controls

### Privacy Rules
- Default: no sharing until accepted + enabled
- Blocked users cannot request/view
- Audit log for sharing state changes

---

## 9. Security, Privacy, and Compliance Baseline

### Access Control
- Row-level security for all user-owned data
- Principle of least privilege for service accounts
- Signed JWT validation at all private endpoints

### Data Protection
- TLS in transit
- Encryption at rest (managed service + secrets management)
- PII minimization and retention policy
- Account deletion + data erasure workflow

### Abuse and Reliability Controls
- Rate limiting per IP/user/token
- Bot and spam mitigation for signup/request endpoints
- Input validation + schema enforcement at API boundary

### Audit and Governance
- Security event logging
- Dependency vulnerability scanning in CI
- Incident response runbook with on-call ownership

---

## 10. Backend Blueprint (Production)

```
backend/
├── app/
│   ├── main.py
│   ├── api/
│   │   ├── auth.py
│   │   ├── parking.py
│   │   ├── lots.py
│   │   ├── compass.py
│   │   ├── friends.py
│   │   ├── heatmap.py
│   │   └── forecast.py
│   ├── services/
│   │   ├── geo/
│   │   │   ├── geometry.py
│   │   │   ├── virtual_grid.py
│   │   │   └── geofence.py
│   │   ├── detection/
│   │   │   ├── parking_detector.py
│   │   │   └── confidence.py
│   │   ├── predictions/
│   │   │   ├── rush_hour.py
│   │   │   ├── heat_map.py
│   │   │   └── forecast.py
│   │   └── social/
│   │       └── sharing.py
│   ├── db/
│   │   ├── models/
│   │   ├── migrations/
│   │   └── repositories/
│   └── workers/
│       ├── occupancy_jobs.py
│       └── feature_jobs.py
└── data/
    └── parking_zones/
```

### Required Endpoints
- `POST /api/park/session`
- `POST /api/park/session/end`
- `GET /api/park/session/active`
- `GET /api/park/compass`
- `GET /api/lots`
- `GET /api/lot/{id}`
- `GET /api/lot/{id}/heatmap`
- `GET /api/lot/{id}/rush-hours`
- `GET /api/lot/{id}/forecast`
- `POST /api/friends/request`
- `POST /api/friends/accept`
- `POST /api/friends/block`
- `GET /api/friends`
- `PUT /api/friends/{id}/sharing`

---

## 11. Database Schema (Production)

Core entities:
- `users`
- `lots` (PostGIS polygons + metadata + capacity)
- `parking_spots` (virtual grid spots)
- `parking_sessions` (stateful lifecycle + confidence)
- `friendships` (pending/accepted/blocked)
- `friend_sharing_settings`
- `common_locations`
- `heatmap_cells`
- `rush_hour_stats`
- `forecast_snapshots`
- `event_logs` (audit/ops)

### PostGIS Requirements
- Polygon containment checks for geofence entry
- Nearest-neighbor lookup for suggested spots
- Spatial indexes (`GIST`) on lot and cell geometries

---

## 12. Observability and Operations

### Telemetry
- Structured logs with request correlation IDs
- Metrics: request rate, error rate, latency, job lag, queue depth
- Tracing for critical API paths

### Monitoring
- Alerting on SLO breaches
- Dashboarding for occupancy ingestion, forecast freshness, sensor quality
- Crash/error monitoring for mobile and web

### Runbooks
- Incident response playbooks (auth outage, realtime lag, map failure, queue backlog)
- Data recovery and backup restore drills

---

## 13. QA, Testing, and Release Gates

### Testing Requirements
- Unit tests (core logic, scoring, geospatial helpers)
- Integration tests (API + DB + auth)
- End-to-end flows:
  - signup/login,
  - park/confirm/end,
  - find car with compass,
  - friend sharing and filtering,
  - geofence CRUD admin flow

### Performance and Scale Validation
- Load tests at expected peak + 2x headroom
- Soak tests for long-running stability
- Mobile battery and background behavior benchmarks

### Release Gate (must pass)
- 0 critical security issues
- 0 P0/P1 open defects
- SLO conformance in staging under load
- Data migration rollback proven
- On-call and monitoring fully configured

---

## 14. UX and Design System Requirements

### Themes
- Campus Mode (default)
- Knight Mode (retro)

### Quality Bar
- No broken navigation paths
- Accessibility baseline (contrast, screen reader labels, touch targets)
- Consistent interaction patterns across iOS/Android/Web

---

## 15. Development Phases (Production Path)

### Phase 1 - Core Platform Hardening
- Finalize FastAPI + PostGIS architecture
- Complete auth/session lifecycle and RLS
- Implement stable lot/session CRUD with spatial correctness
- Establish CI/CD, migration strategy, test harness

### Phase 2 - Detection and Navigation Excellence
- Ship geofence-driven detection pipeline with confidence scoring
- Ship robust compass mode with haptics + sensor filtering
- Deliver virtual grid candidate flow and user correction loop

### Phase 3 - Social + Privacy Completion
- Full friendship lifecycle including block/unblock
- Per-friend sharing controls
- Map filters and visibility rules with auditability

### Phase 4 - Prediction and Intelligence
- Heatmap ingestion and rendering
- Rush-hour and forecast services with confidence bands
- Model monitoring and fallback heuristics

### Phase 5 - Launch Readiness and Scale
- Security hardening and abuse prevention
- Load/soak tests with production-like traffic
- App store readiness, staged rollout, live-ops readiness

---

## 16. Launch and Rollout Strategy

### Rollout
- Internal alpha -> closed beta -> staged public rollout
- Percentage-based rollout with kill switches
- Real-time health checks between rollout stages

### Post-Launch
- Weekly reliability review
- Forecast quality review
- Continuous tuning from telemetry and user feedback

---

## 17. Success Metrics (Production)

### Product
- DAU/WAU retention
- Session completion rates for park/find flows
- Friend feature engagement and sharing opt-in rate

### Reliability
- SLO compliance (% time in target)
- Crash-free session rate
- Incident count + MTTR

### Intelligence Quality
- Forecast MAE/MAPE
- Heatmap label precision/recall
- Parking detection false positive/negative rates

---

## 18. Definition of Done (Non-Negotiable)
A feature is only “done” when all are true:
1. Product acceptance criteria met
2. Tests added and passing in CI
3. Observability added (logs/metrics/alerts as appropriate)
4. Security and privacy review complete
5. Performance validated against target budgets
6. Documentation updated (API + runbook + user impact)

If any of the above is missing, the feature remains in progress.

---

## 19. Product Experience Canon (Required)
Detailed expected user behavior, state transitions, edge cases, and strict implementation corrections are defined in `PRODUCT_EXPERIENCE_BLUEPRINT.md`.

Requirements:
- Every feature implementation PR must map to one or more scenarios in the blueprint.
- QA test plans must explicitly reference blueprint acceptance scenarios.
- Any deviation from blueprint behavior requires architecture and product sign-off.
