# ScarletSpots Inference & Ground Truth Plan

## Problem

Observed ScarletSpots sessions are not the same thing as true campus-wide occupancy. Session counts are a biased sample.

## Goal

Estimate lot state more honestly while keeping the product understandable. Confidence should be visible whenever certainty is weak.

## Inputs already present in the repo

- live session-derived occupancy counts
- lot capacities and metadata
- pattern-first forecast infrastructure
- circling metrics
- native sensing context from AutoPark
- user feedback hooks for bad detections

## Current pre-launch rule

When observed signal is weak, the product should default to pattern guidance rather than pretending it has realtime campus truth.

Important client-facing metadata:

- `source`
- `confidence`
- `signal_strength`
- `display_mode`
- `confidence_interval`

## Model direction

### Prior layer

- time-of-day and day-of-week demand priors
- lot-type and campus shrinkage
- authored lot profiles as a temporary baseline

### Observation layer

- active session starts and ends
- circling duration
- vulture-like search behavior if retained
- manual feedback and audit samples

### Output layer

- estimated occupancy
- uncertainty range
- source and explanation metadata suitable for UI

## Engineering direction

- keep the current forecast provider scaffolding
- improve current-state estimation incrementally instead of rewriting everything at once
- decide explicitly whether richer posterior occupancy should flow through REST, websocket, or both

## Practical evaluation

Track at least:

- MAE on occupancy rate
- MAPE when demand is non-trivial
- segmented performance by campus, lot size, and time window
- bucket distribution across `typical_pattern`, `mixed`, and `observed`

## Scope note

The repository already contains honest pre-launch metadata and forecast scaffolding. A fully calibrated inference engine is still future work.

Last reviewed: 2026-04-26
