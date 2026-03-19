# ScarletSpots Inference & Ground Truth Plan

## 0) Threat model (sampling bias) + objective

We only observe the subset of cars/parkers that use the app, yet we need 80–90% occupancy accuracy across 200+ lots. Treat the true per-lot occupancy as a latent state and the app signals as biased, noisy observations.

We will build a probabilistic, physics-constrained estimator that:

- uses Rutgers SOC as a time-varying arrival prior (unobserved demand)
- uses phone-sensor “spot openings” and “searching” as additional observation channels
- calibrates the observation bias using incentivized manual verification + periodic manual audits
- outputs occupancy as a distribution (low/high) rather than a single number

## 1) Core estimator (state-space, with sampling-bias correction)

Let for each lot `l` at time `t`:

- `x_l(t)` = true occupied spaces (latent)
- `y_l(t)` = app-observed occupied spaces (what `lot_occupancy.count` currently reflects)
- `a_l(t)` = effective adoption/visibility factor (0–1)

### 1.1 Dynamics (physics-based)

Use an arrivals/departures model with SOC-driven arrivals:

- `x_l(t+Δ) = x_l(t) + A_l(t) - D_l(t)`
- `A_l(t)` comes from SOC “lot pressure” (expected arrivals into lot l)
- `D_l(t)` comes from an exit/dwell-time model informed by “exit velocity” / drive-out detection

### 1.2 Observation model (sampling bias)

App sessions observe a subset of cars. We model:

- `y_l(t) ~ Binomial(x_l(t), a_l(t))` (or Poisson approximation for speed)
- event logs (spot openings, searches) add extra likelihood terms (next sections)

### 1.3 Posterior inference

At a minimum, implement Bayesian filtering over `(x_l(t), a_l(t))` using:

- SOC prior mean/variance
- event likelihoods from phone-sensor detections (departures/openings + searching)
- periodic ground-truth constraints from manual verification/audits

This is what replaces the current purely observational `lot_occupancy` count in the user-facing UI.

### 1.4 Integration point with existing code

Today:

- Forecast endpoint `/api/v1/lots/{lot_id}/forecast` uses `HeuristicForecastProvider` / `MLForecastProvider` (`backend/app/services/forecasting.py`, `backend/app/services/ml_forecast_provider.py`, `backend/app/routers/lots.py`).
- Live UI occupancy is sourced from `/api/v1/lots/occupancy` which reads `lot_occupancy`.

Plan:

- keep current forecast providers as fallback/initial priors
- introduce an `InferenceForecastProvider` that produces `expected/low/high` from the state-space posterior
- add an estimated-occupancy endpoint or (optionally) extend `/lots/occupancy` to return `{observed, estimated, low, high}`

## 2) Rutgers Oracle (Class Schedule Integration) → Lot Pressure Scores

### 2.1 Ingest Rutgers SOC JSON

You indicated the SOC URL returns a huge JSON blob. Build a backend ingestion pipeline:

- `soc_ingestor` job fetches the JSON on a cadence (e.g., hourly, daily regeneration for safety)
- normalize records into a canonical schema:
  - `class_event_id` (stable key), `start_time`, `end_time` (if present)
  - `building_name` / building code
  - `enrollment_estimate` (class size) if provided
  - campus/region indicators
- store deduped events in Postgres

Critical: treat attendance/parking propensity as uncertain.

### 2.2 Map SOC buildings to lot influence

We need a mapping from SOC building to lots. We can reuse the app’s notion of building coordinates:

- `mobile/src/shared/constants/buildings.ts` provides lat/lng for a set of buildings.

For any SOC building not exactly matching, use:

- fuzzy match (string normalization)
- fallback: campus-only heuristic

Then for each lot `i` in the top-3 nearest lots (by walking distance/time), compute:

- `τ_i` = walking time from building to lot i (distance / walking_speed)
  - walking_speed: start with 1.4 m/s (calibrate later)

### 2.3 Mathematical weighting around lecture start (your 9:45 → 10:00 example)

For a lecture event with start time `T0 = 10:00` and size `N = 400`:

- Let `p_drive` = probability a attendee drives and parks in a campus lot
- Expected arrivals into lot i:
  - `E[Arrivals_i] = N * p_drive * α_i`

Where `α_i` allocates the lecture’s parking share across the nearest lots using a softmax over walking time:

- `α_i = exp(-β * τ_i) / Σ_{j in top3} exp(-β * τ_j)`

Now define the arrival-rate shape over time. For each lot i, shift the event arrival curve by walking time:

- Set `μ_i = T0 - τ_i - buffer`
  - buffer is an empirical “parking lead time” (minutes before arrival becomes useful)
- Use a truncated normal arrival-rate kernel over the window `t ∈ [T0-15, T0]` (or a logistic CDF):
  - `λ_i(t) = E[Arrivals_i] * g(t; μ_i, σ)`
  - `g` is normalized so its integral over the window equals 1 (or close)

Interpretation for your question:

- At `t = 9:45`, lots with smaller `τ_i` have larger `μ_i` earlier and therefore higher `λ_i(9:45)`.
- As `t → T0`, farther lots start contributing more.

### 2.4 From arrivals to “Lot Pressure Score”

Compute a pressure score per lot per time slice:

- `LP_l(t) = E[x_l(t) | SOC prior] / capacity_l`

To match the rest of the system, output either:

- pressure on a 1–5 minute grid, or
- pressure at the forecast slices (`now`, `+15m`, `+30m`, `+60m`) and maintain an internal curve.

### 2.5 Learning/calibration inputs

Calibration parameters that must be fit using ground truth:

- `p_drive`
- `β` (how quickly parking share decays with walking time)
- `buffer`, `σ` (shape/width of arrivals)
- mapping error rate for SOC building → lot influence

## 3) Exit Velocity & Passive Metrics → “Spot Opening” observation channel

### 3.1 What we already have (departure vs walk-out)

The current auto-end logic is in `mobile/src/shared/services/GeofenceManager.ts`:

- On geofence `Exit`, it auto-ends only when the user likely drove out:
  - `wasRecentlyDriving()` and persisted `wasDrivingRecentlyForAutoEnd()`.

The current parking detection is in `mobile/src/shared/services/ParkingDetectionService.ts`:

- detect a transition from driving (>5 m/s) to stopped (<1 m/s)
- use accelerometer stillness + heading change + inside-lot check

### 3.2 Define “Spot Opening” as a departure event

A “spot opening” is best approximated as:

- a drive-out detected for an app user who had an active session in lot l
- within a short deceleration-to-drive window after being inside that lot

So define:

- `drive_start`: speed crosses upward threshold (stopped → driving), e.g. from `<1 m/s` to `>5 m/s` within `W` seconds
- `drive_out_confidence`: combine speed transition + stillness drop + heading change

### 3.3 Passive enhancement: Bluetooth/CarPlay disconnection (optional, strengthen signal)

On some devices we can treat:

- Bluetooth audio device disconnect or CarPlay session end

as evidence of “leaving mode” when it co-occurs with `drive_start`.

Practical note (skeptical): iOS/Expo access to reliable CarPlay/Bluetooth state can be limited; treat as an optional signal that only increases confidence when available.

Formal fusion:

- `P(drive_out | sensors) ∝ P(speedTransition) * P(stillness) * P(heading) * P(conn_disconnected)`
- where `P(conn_disconnected)` is a learned multiplier (often near 1 or 0.8 if weak).

### 3.4 How “Spot Openings” improve occupancy estimates

Departures are the dominant negative feedback after class end. Spot opening evidence helps:

- constrain the dwell-time distribution (how quickly cars leave after SOC peaks)
- tighten the posterior for `x_l(t)` because it directly observes `D_l(t)` (for the app-user subset)

## 4) The “Vulture” Demand Metric (Searching behavior) → Arrival-rate correction

### 4.1 Define “Searching” mechanically

A user is “searching” in lot `l` when, simultaneously:

- the device is inside or near lot l (polygon containment or geofence region)
- speed is low but not walking: `v ∈ [v_min, v_max]`
  - start with `v_max = 5 mph ≈ 2.2 m/s` (your requirement)
  - set `v_min` around `0.3–0.5 m/s` to ignore idle while walking
- behavior persists for `≥ T_search` (e.g. 30–90 seconds)
- optional: low curvature/large heading variance indicates circling

This is similar in spirit to how the app already uses speed thresholds in `ParkingDetectionService.ts` (driving vs stopped).

### 4.2 Logging “Vulture events”

Create an event record when a user transitions into/out of “searching”:

- `lot_id`, `start_time`, `end_time`, `avg_speed`, `path_features`, `gps_accuracy`

### 4.3 How demand improves occupancy estimate (sampling bias correction)

We have observed arrivals (app sessions) but not necessarily total demand. Searching is a demand proxy:

- `Searching_l(t)` increases when more drivers need parking.

Use it to adjust either:

- `λ_arr(t)` directly (expected future arrivals)
- or `a_l(t)` (adoption visibility) by comparing observed session starts vs searching intensity

One robust approach:

- estimate a latent “arrivals intent” score `I_l(t)` from searching intensity
- map `I_l(t)` to arrivals using a calibrated conversion factor `κ` learned from ground truth

Net effect: even when app adoption is low, searching signals from the subset that does have the app can still reveal the lot’s demand phase.

## 5) Incentivized Ground Truth (“Waze-style”) + conflict handling

### 5.1 User-facing loop

Add a lightweight prompt when the estimator is uncertain and a user is near/inside a lot:

- Buttons: `Confirm Full`, `Confirm Not Full`, optional `Count (approx)`
- Reward loop: badges, streaks, occasional priority alerts

This should be tied to uncertainty, not random.

### 5.2 Data fusion for conflicting reports

Model each report `r` as a noisy measurement of true state `x_l(t)`:

- If report is binary “full/not full,” define a threshold at `capacity_l * θ`.
- Each user `u` has a reliability `ρ_u` learned from past audits.

Then aggregate reports using Bayesian updating:

- `P(state | reports) ∝ Π_u P(report_u | state, ρ_u)`

### 5.3 How to prevent gaming / spam

Include safeguards:

- throttle per user per lot per time window
- require a proximity constraint and/or “active session in last N minutes” to reduce fake inputs
- down-weight users with low reliability

## 6) Confidence Interval UI (avoid single-number overconfidence)

### 6.1 API output contract

Instead of returning a single occupancy percentage, return:

- `expected_full_rate` (or expected occupancy count)
- `low_full_rate`, `high_full_rate` (e.g. 10th–90th percentile or 25–75 depending on desired UI calmness)
- optional `confidence_reason` metadata (e.g., “high SOC pressure, recent departures detected”)

### 6.2 UX strategy

On the map lot card / occupancy pill currently used in `SearchScreen.tsx`:

- show a range like `85–92% Full`
- if CI is narrow (<5–7%), optionally show `~88% Full` and a subtle “high confidence” indicator
- color coding should use the expected value, but tooltips/badges should reflect the CI

The goal is to align expectations and reduce churn from “I checked and it was wrong.”

## 7) Measuring Accuracy (MAPE) with a Manual Audit protocol

### 7.1 Evaluation design (sampling-aware)

Use two complementary evaluation sets:

- Passive operational evaluation: run periodically without using the same signals you’re evaluating (avoid leakage).
- True ground-truth evaluation: in-person counts or high-confidence manual verification at scheduled times.

### 7.2 Manual audit protocol

For each selected lot/time slice:

- Choose representative times (SOC starts/ends ±30–60 minutes, plus off-peak)
- Auditors perform manual counts of parked cars (or validated occupancy proxy)
- Record actual `x_l(t)` and timestamp, ideally within a tight window

### 7.3 MAPE computation

For each audit record i:

- let `A_i` = actual occupancy rate (0–1 or 0–100%); let `P_i` = predicted expected occupancy
- MAPE:
  - `MAPE = (1/n) Σ |(A_i - P_i) / max(A_i, ε)| * 100`
  - use `ε` (e.g., 0.05 capacity) to avoid division blow-ups at near-zero occupancy
- break down metrics by:
  - campus
  - lot size buckets
  - SOC pressure level buckets
  - time-of-day buckets

### 7.4 Feedback loop into calibration

Use audit outcomes to re-fit:

- SOC→arrival parameters
- departure/dwell model parameters
- conversion `Searching → arrivals intent`
- user reliability for manual reports

## 8) Extra ideas (that materially help accuracy)

- Build an explicit “walk-out vs drive-out” classifier and use it to separate `D_l(t)` (true departures) from `false departures`.
- Add an “adoption visibility prior” `a_l(t)` that changes with:
  - campus density
  - time-of-day
  - mobile “searching” intensity
- Maintain separate streams:
  - `observed occupancy` (from app sessions)
  - `estimated occupancy` (posterior)
  - both can be displayed, but UX should default to estimated.
- Use a “regret minimization” policy for when to ask for manual confirmation (only ask when CI is wide or when SOC+signals disagree).

## 9) System diagram

```mermaid
graph TD
  SOC[Soc Ingest JSON] --> LP[LotPressureScores]
  Mobile[Mobile Sensors & Sessions] --> Events[SpotOpenings + Searching Events]
  Mobile --> Obs[ObservedOccupancy y_l(t)]
  LP --> Prior[Arrival Prior]
  Events --> Likelihood[Likelihood Terms]
  Obs --> Likelihood
  Ground[Manual Verification Reports] --> Calib[Calibration & Reliability]
  Prior --> Inference[Inference Engine Posterior]
  Likelihood --> Inference
  Calib --> Inference
  Inference --> UI[Confidence Interval UI]
  Inference --> Audit[MAPE Audit Dataset]
```

## 10) Deliverables checklist

- SOC ingestion normalization spec
- LotPressureScore definition + 9:45→10:00 weighting formula (with parameters to calibrate)
- SpotOpening detection logic (speed transitions + optional connection disconnect)
- Vulture Searching definition + demand-to-arrivals mapping
- Ground-truth UX loop + Bayesian conflict fusion
- Confidence interval API + UX rules
- Manual audit plan + MAPE pipeline definition

## Pointers to current code to extend (for implementation later)

- Forecast providers: `backend/app/services/forecasting.py`, `backend/app/services/ml_forecast_provider.py`
- Forecast endpoint: `backend/app/routers/lots.py`
- Existing detection: `mobile/src/shared/services/ParkingDetectionService.ts`, `mobile/src/shared/services/GeofenceManager.ts`, `mobile/src/shared/services/BackgroundTasks.ts`
- Occupancy write path: `backend/app/routers/park.py`
- Feedback: `backend/app/models/parking.py`

