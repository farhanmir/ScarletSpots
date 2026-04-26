# ScarletSpots Inference & Ground Truth Plan

## Problem

App-observed sessions are not the same thing as true lot occupancy. We only directly observe users who run ScarletSpots, so raw session-driven counts are a biased sample.

## Goal

Estimate real occupancy more accurately while exposing confidence, not fake certainty.

## Inputs we already have

- live session-derived occupancy counts
- lot capacity and metadata
- forecast provider infrastructure
- native sensing context from the iOS app
- feedback / calibration hooks

## Planned model direction

### Prior layer
- time-of-day and day-of-week demand priors
- lot-type and campus-based shrinkage

### Observation layer
- active session starts/ends
- searching / vulture-like behavior
- departure/opening evidence
- manual verification or audit samples

### Output layer
- expected occupancy
- confidence interval
- reason metadata suitable for UI/debugging

## Product rule

If confidence is weak, the UI should say so. A useful range is better than a precise lie.

## Implementation direction

- keep current forecast providers as fallback/prior infrastructure
- add an inference-oriented provider instead of rewriting the entire forecast stack blindly
- decide explicitly whether posterior occupancy reaches clients by websocket, REST, or both

## Practical evaluation

Track at least:
- MAE on occupancy rate
- MAPE where demand is non-trivial
- segmented accuracy by campus, lot size, and demand window

## This is still future-facing

The repository has forecast scaffolding now, but the full bias-correction engine is not the current launch baseline.

Last reviewed: 2026-04-26
