# Occupancy Accuracy & Automation Plan

Last updated: 2026-04-28

## Goal

Improve ScarletSpots occupancy and forecast quality before launch without pretending we have perfect realtime truth.

## Plain-English Summary

Right now the app is making a smart guess from weak signals:

- ScarletSpots parking sessions
- time-of-day patterns
- lot capacity
- circling behavior
- optional traffic / SOC context

That is useful, but it is not the same as true lot occupancy. The fastest path to better accuracy is:

1. automate logging of the weak signals we already have
2. collect small amounts of real-world ground truth
3. compare estimate vs truth
4. calibrate each lot from that comparison

## What We Can Automate Now

### 1. Historical snapshot logging

Create a scheduled job that stores a per-lot snapshot every 5 to 15 minutes.

Suggested fields:

- `lot_id`
- `observed_at`
- `capacity`
- `observed_count`
- `observed_occupancy_rate`
- `typical_count`
- `typical_occupancy_rate`
- `display_count`
- `display_occupancy_rate`
- `source`
- `confidence`
- `signal_strength`
- `display_mode`
- `confidence_interval`
- `circling_samples`
- `circling_p50_seconds`
- `circling_p75_seconds`
- `traffic_multiplier`
- `soc_multiplier`
- `updated_at`

Why this matters:

- gives us a history of what the system believed
- makes later evaluation possible
- enables per-lot and per-time calibration

### 2. Stale-data decay

Automate logic that reduces trust in "live" occupancy when data is old.

If the latest occupancy update is stale:

- lower confidence
- widen the confidence interval
- shift `display_mode` from `live` toward `pattern`

This prevents stale values from looking fresh and accurate.

### 3. Per-lot baseline learning

Automate creation of lot-specific patterns from historical snapshots.

Examples:

- Lot A may fill hard on weekdays at 8am
- Lot B may stay moderate until noon
- Lot C may be mostly weekend-light

This is better than relying too heavily on a small number of broad profile curves.

### 4. Feedback collection

Add lightweight feedback capture for trusted users, internal testers, or admins.

Examples:

- `Mostly empty`
- `About half full`
- `Almost full`
- `Full`

Even low-resolution truth is valuable if it is timestamped and tied to a lot.

## What Cannot Be Fully Automated Easily

Exact true occupancy is hard to automate unless we have direct infrastructure such as:

- official parking sensors
- gate entry / exit feeds
- campus operations data
- authorized camera/computer vision inputs

Without those, the app can estimate well, but not magically know the exact answer.

## Recommended Hybrid Approach

Use automation for signal collection and use human truth samples for calibration.

### Human truth sources

- manual counts by team members
- trusted tester reports
- parking-ops spot checks
- later: camera-assisted estimates if legally and operationally allowed

### Why hybrid is the best pre-launch move

- low implementation risk
- no need for external infrastructure
- produces real calibration data quickly
- improves both occupancy and forecast quality

## Concrete Pre-Launch Plan

### Phase 1. Instrumentation

Implement:

- periodic snapshot logging
- stale-data decay
- storage for truth samples

Suggested new table:

- `lot_observation_samples`

Suggested fields:

- `id`
- `lot_id`
- `observed_at`
- `truth_source`
- `occupancy_percent`
- `confidence`
- `notes`
- `created_by`
- `created_at`

`truth_source` examples:

- `manual`
- `trusted_user`
- `ops`
- `camera_estimate`

### Phase 2. Internal truth capture

Build a simple internal or admin-facing flow that lets someone submit:

- lot
- fullness percent or band
- optional note

This can be extremely simple. It does not need a polished public UX first.

### Phase 3. Automatic evaluation

For every truth sample:

- fetch the nearest logged system snapshot
- compare estimated occupancy vs observed truth
- store the error

Metrics to track:

- MAE by lot
- MAE by hour-of-day
- MAE by weekday/weekend
- error by `source` bucket
- error by `signal_strength`

### Phase 4. Calibration

Use the evaluation results to apply lot-specific corrections.

Examples:

- if a lot is consistently under-estimated on weekday mornings, add a correction there
- if sparse observed counts are too noisy for a lot type, raise the threshold before calling it `live`
- if stale data performs badly after a certain age, downgrade it sooner

## Forecast Improvement Direction

The current ML path should not be over-trusted yet.

Why:

- it is trained from session-start proxies
- session starts are not the same thing as true occupancy

Longer-term improvement:

- train on inferred occupancy history or truth-sampled occupancy history
- include lagged snapshots, time windows, stale age, and circling pressure
- keep uncertainty visible in the API and UI

## Good Automation Targets

These are realistic and worth doing soon:

- periodic lot-state snapshot job
- stale-data confidence decay
- truth-sample ingestion endpoint
- basic admin truth-entry UI
- evaluation dashboard or report
- per-lot calibration hooks

## Bad Near-Term Bets

These are probably too heavy before launch:

- trying to fully infer exact occupancy from sessions alone
- pretending sparse app activity is strong campus-wide truth
- building a complicated ML pipeline before collecting better labels
- computer vision without operational/legal clarity

## Suggested Order Of Work

1. add historical snapshot logging
2. add stale-data downgrade rules
3. add truth-sample storage and an internal submission flow
4. compute accuracy reports by lot and hour
5. calibrate current-state blending and thresholds
6. retrain or redesign forecasts only after better labels exist

## Short Version

Best answer:

- yes, parts of this can be automated
- no, exact truth probably cannot be fully automated with current inputs
- the best approach is hybrid: automate weak-signal logging, collect small amounts of real truth, and calibrate from there
