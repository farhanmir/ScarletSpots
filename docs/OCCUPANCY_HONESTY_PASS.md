# Occupancy Honesty Pass

Last updated: 2026-04-26

## Why This Exists

ScarletSpots is still pre-launch, so raw parking-session counts are not a believable proxy for true lot occupancy yet. The old behavior made heuristic guesses look like live truth. This pass changes the product contract so weak-signal occupancy is shown as a typical-pattern estimate instead of fake realtime certainty.

## What Was Implemented

### Backend contract changes

- `/api/v1/lots/occupancy` now preserves compatibility while adding explicit pre-launch metadata:
  - `observed_count`
  - `observed_occupancy_rate`
  - `typical_count`
  - `typical_occupancy_rate`
  - `source`
  - `confidence`
  - `signal_strength`
  - `display_mode`
- `count` and `occupancy_rate` are still present for current clients, but they now represent the recommended display value rather than always implying live truth.
- `/api/v1/lots/{lot_id}/forecast` now returns a richer `current` payload with the same observed-vs-typical metadata.
- Forecast metadata now distinguishes pattern-first output from observed-informed output through:
  - `metadata.mode`
  - `metadata.current_source`
  - `metadata.signal_strength`
  - `metadata.confidence`
  - `metadata.profile_type`

### Heuristic modeling changes

- Removed the deterministic random variance from the heuristic forecast provider so repeated requests no longer add fake realism.
- Replaced the single hardcoded time-of-day prior with authored pre-launch lot profiles:
  - `commuter_peak`
  - `garage_core`
  - `resident`
  - `weekend_light`
- Added a lot-profile mapping layer using bundled lot metadata and a small override table.
- Kept traffic as a weak context feature only, with its influence damped so it cannot dominate the estimate.
- Added explicit observed-signal classification:
  - `typical_pattern` when there is no observed signal
  - `mixed` when observed signal is sparse
  - `observed` when signal is strong enough to trust as primary display

### Native iOS client changes

- Added decoding support for the new occupancy and forecast metadata in the Swift models.
- Updated websocket state handling so realtime updates can coexist with pattern-first display semantics.
- Updated major lot-status surfaces to render honest pattern-mode UI:
  - map pins
  - search results
  - lot detail sheet
  - occupancy pill
- Pattern-mode surfaces now prefer status messaging such as:
  - `Likely busy`
  - `Moderate`
  - `Likely open`
  - `No live signal`
- Live-looking numeric occupancy remains primary only when the backend marks the lot as `display_mode=live`.

### Documentation updates

- Updated repo docs to reflect the new pre-launch contract:
  - `README.md`
  - `ARCHITECTURE.md`
  - `INFERENCE_GROUND_TRUTH.md`

## Current Product Semantics

### Occupancy sources

- `observed`
  - Strong enough live app-session signal to display as primary live occupancy.
- `mixed`
  - Some observed signal exists, but not enough to claim campus-wide truth.
- `typical_pattern`
  - No reliable live signal; use pattern-based guidance only.

### Display modes

- `live`
  - Numeric occupancy can be treated as the primary user-facing value.
- `pattern`
  - UI should favor status-style messaging over precise counts/percentages.

### Confidence levels

- `high`
  - Strong observed signal.
- `medium`
  - Sparse observed signal blended with pattern guidance.
- `low`
  - Typical-pattern estimate only.

## Files Touched In This Pass

### Backend

- `backend/app/services/forecasting.py`
- `backend/app/routers/lots.py`
- `backend/app/services/ml_forecast_provider.py`
- `backend/tests/test_forecast_provider.py`
- `backend/tests/test_lots.py`
- `backend/tests/test_frontend_api_contract.py`

### iOS

- `ios-native/ScarletSpots/Sources/Models/AppModels.swift`
- `ios-native/ScarletSpots/Sources/Services/WebSocketManager.swift`
- `ios-native/ScarletSpots/Sources/UI/OccupancyPill.swift`
- `ios-native/ScarletSpots/Sources/Views/MapView.swift`
- `ios-native/ScarletSpots/Sources/Features/Search/SearchScreen.swift`
- `ios-native/ScarletSpots/Sources/Features/Home/LotDetailsSheet.swift`

## Validation Completed

- Ran targeted backend tests:
  - `backend/tests/test_forecast_provider.py`
  - `backend/tests/test_lots.py`
  - `backend/tests/test_frontend_api_contract.py`
- Result: all targeted backend tests passed.

## Important Notes

- This pass did not require a database migration for occupancy honesty behavior.
- Separate parking-session source metadata work in the current branch does require its own migration:
  - `backend/migrations/versions/d2e4f6a8b1c3_add_session_source_metadata.py`
- iOS compile/build validation was not run as part of this pass, so Swift-side behavior should still be smoke-tested in Xcode.

## What Still Needs To Be Done

### Before launch

- Smoke-test the new iOS UI states on device/simulator:
  - no observed signal
  - sparse signal
  - strong observed signal
- Review copy and polish for status labels to make sure they feel natural in the app.
- Decide whether any remaining screens outside the main lot surfaces still assume `occupancy_rate` always means live realtime truth.
- Consider simplifying or renaming old config flags that still reference heuristic seeding, since the behavior is now semantically different.

### Early post-launch

- Start collecting calibration inputs:
  - real parking-session starts/ends
  - optional user feedback on lot fullness
  - admin/manual sample counts
  - vulture/searching behavior observations
- Measure how often lots fall into each bucket:
  - `typical_pattern`
  - `mixed`
  - `observed`
- Track basic forecast/occupancy quality metrics by lot and campus once real signal exists.

### Later inference work

- Build a true current-state estimator that separates:
  - observed ScarletSpots sessions
  - estimated total occupancy
  - uncertainty
- Replace rule-based confidence with calibrated confidence intervals.
- Train forecasts from inferred occupancy history instead of session-start proxies alone.
- Introduce stronger lot-specific priors from actual historical behavior instead of mostly authored profile curves.
- Revisit websocket semantics so clients can optionally receive both observed and inferred occupancy directly.

## Recommended Next Step

The next highest-value step is an iOS smoke-test pass plus a small cleanup pass on naming and copy. After that, the product is in a good pre-launch state: honest, useful, and ready to start gathering the data needed for real inference later.
