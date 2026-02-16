# ScarletSpots - Execution Roadmap (Production, 100k Users)

## Mission
Ship a production-grade ScarletSpots platform to 100k users with reliability, privacy, and predictive quality that meets launch SLOs and operational readiness standards.

Implementation reference: `PRODUCT_EXPERIENCE_BLUEPRINT.md` is the behavioral source of truth for user flows, edge cases, and acceptance scenarios.

## Current Baseline (Reality Check)
- Working foundations: auth, map rendering, parking session CRUD, geofence editor CRUD, basic friends flow.
- Not launch-ready: predictive layer, robust detection pipeline, privacy controls, security hardening, operational readiness, and scale testing.

---

## Phase 0 - Stabilize Current Codebase (2 weeks)
Goal: eliminate obvious defects and remove prototype-level breaks before adding scope.

### P0 Tasks
1. Fix route inconsistencies in web admin/map navigation (`/admin/geofence` vs `/admin/geofences`).
2. Remove hardcoded Supabase secrets/config from mobile client.
3. Replace placeholder password reset flow with real Supabase reset flow.
4. Resolve duplicate/legacy app surfaces and lock one source of truth.
5. Add runtime config validation for all environments.

### Exit Criteria
- No broken navigation paths in critical flows.
- No hardcoded production credentials in app code.
- Auth recovery works end-to-end.
- One canonical frontend/mobile path documented.

---

## Phase 1 - Platform Hardening (4-6 weeks)
Goal: production backend/data foundation with security and observability.

### Workstream A: Backend Foundation
- Stand up FastAPI service as primary API layer.
- Implement repository/service boundaries.
- Define API contracts and versioning policy.

### Workstream B: Data Platform
- Implement PostgreSQL + PostGIS schema and migrations.
- Add spatial indexes and query benchmarks.
- Introduce Redis for caching and rate-limiting counters.

### Workstream C: Security & Access
- Implement strict RLS for user-owned records.
- Enforce JWT validation and least-privilege service tokens.
- Add rate limiting and abuse prevention controls.

### Workstream D: Observability
- Structured logging with correlation IDs.
- Metrics + dashboards for latency/error/queue depth.
- Alerts for SLO breach conditions.

### Exit Criteria
- SLO instrumentation active in staging.
- Security baseline complete (RLS + authz + rate limits).
- Migration rollback tested successfully.

---

## Phase 2 - Detection + Navigation System (5-7 weeks)
Goal: deliver trustworthy auto-detection and reliable find-car guidance.

### Workstream A: Detection Engine
- Geofence entry/exit state machine.
- Drive->stop->walk transition model (speed + accelerometer + heading).
- Confidence scoring and threshold tuning via feature flags.

### Workstream B: Confirmation UX
- Candidate pin with confidence radius.
- “Top 3 plausible spots” selection flow.
- User correction capture for supervised tuning.

### Workstream C: Compass Quality
- Magnetometer-based heading + filtered smoothing.
- Haptic lock-on behavior.
- Fallback path for missing/unstable sensors.

### Exit Criteria
- Median parked-pin error <= 15m in field tests.
- Find-car flow success >= 95% in beta cohort.
- Battery impact within budget under background operation.

---

## Phase 3 - Social + Privacy Completion (3-4 weeks)
Goal: complete friendship and sharing safely.

### Tasks
- Full friendship lifecycle (pending/accept/block/unblock).
- Per-friend sharing toggle and enforcement.
- Friend marker filter modes (all/friends/same-lot).
- Sharing state audit logs.

### Exit Criteria
- Data visibility rules verified by integration tests.
- No unauthorized cross-user location exposure in security tests.

---

## Phase 4 - Intelligence Layer (5-6 weeks)
Goal: production heatmap and forecasting services.

### Workstream A: Heatmap
- Cell-based occupancy pipeline with freshness guarantees.
- Map overlay rendering on mobile/web.

### Workstream B: Forecasting
- 15/30/60 minute forecast endpoints.
- Confidence bands and model fallback behavior.
- Drift monitoring and automatic rollback to heuristics.

### Exit Criteria
- Forecast MAE <= 12% in validation window.
- Heatmap classification precision >= 85%.
- Prediction freshness and latency SLO met.

---

## Phase 5 - Launch Readiness + Scale Validation (3-4 weeks)
Goal: prove production readiness under realistic load and ops conditions.

### Tasks
- Load tests at expected peak and 2x headroom.
- Soak tests for reliability and queue stability.
- Incident drills (auth outage, realtime lag, DB failover scenarios).
- App store release prep + staged rollout controls.

### Exit Criteria (Hard Gate)
- 0 open P0/P1 defects.
- 0 critical security findings.
- SLOs met in staging load tests.
- On-call, runbooks, dashboards, and rollback plan approved.

---

## Cross-Cutting Quality Gates (Every Phase)
1. Unit + integration tests required for new logic.
2. Observability added with each new endpoint/service.
3. Security/privacy review completed before merge.
4. Documentation updated (API docs + runbook + migration notes).
5. Performance impact measured and accepted.
6. User flow behavior must match the Product Experience Blueprint for all touched journeys.

---

## Team Operating Model
- Weekly architecture review (backend/data/mobile/web).
- Weekly risk review with top 5 blockers and mitigations.
- Daily CI health and defect triage discipline.
- Feature flags mandatory for risky/high-impact behavior.

---

## Prioritized Backlog (Top 20)
1. Fix web admin route mismatches.
2. Remove hardcoded client credentials.
3. Implement password reset flow.
4. Establish canonical app folders and deprecate duplicates.
5. Build FastAPI skeleton with health/auth middleware.
6. PostGIS schema + migrations v1.
7. RLS policies for sessions/friends/sharing.
8. Redis rate limiting + request quotas.
9. Correlated logging + metrics dashboards.
10. Geofence state machine service.
11. Drive/walk transition detector.
12. Confidence scoring service + feature flags.
13. Candidate spot ranking and confirmation UI.
14. Magnetometer compass + haptic lock-on.
15. Friend block/unblock + sharing toggle APIs.
16. Friend visibility filtering on maps.
17. Heatmap cell generation pipeline.
18. Forecast endpoints (15/30/60m) + confidence bands.
19. Load/soak test suite and thresholds.
20. Staged rollout with kill switch and rollback automation.

---

## Timeline (Aggressive, Single Major Release Train)
- Phase 0: Weeks 1-2
- Phase 1: Weeks 3-8
- Phase 2: Weeks 9-15
- Phase 3: Weeks 16-19
- Phase 4: Weeks 20-25
- Phase 5: Weeks 26-29

Total: ~7 months to production-ready launch with hard gates.

---

## Definition of Done (Non-Negotiable)
A deliverable is only complete when:
- Acceptance criteria pass,
- Tests pass in CI,
- Security and privacy checks pass,
- Observability is in place,
- Performance is validated,
- Documentation and runbooks are updated.

---

## Future / Post-Launch Ideas
These features are scoped for V2 or post-launch optimization once core metrics are stable.

### 1. Native Geocoding w/ strict Context
- **Concept**: Use OS-level geocoders (Apple/Google) to allow searching for any POI (e.g. "Starbucks").
- **Challenge**: Requires strict "Bounding Box" or "Context Injection" (e.g. appending ", Rutgers University, NJ") to avoid global results.
- **Why Deferred**: Unreliable on simulators and requires robust error handling for remote users (e.g. searching from PA).
- **Goal**: Re-enable to support non-building POIs once the "Static Index" coverage is outgrown.
