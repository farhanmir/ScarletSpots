# Agent Resources Audit

## Current state

The repository no longer depends on `agent-resources/` as an active source of truth for product direction. The current working sources are:

1. repo code
2. root docs
3. `docs/`

## Why this matters

Historical helper resources may still exist locally or in prior branches, but they should not outrank the actual native/backend implementation.

## Practical rule

When docs disagree, trust:
- `ios-native/`
- `backend/`
- `website/`
- refreshed non-`mobile/` markdown in this repo

Last reviewed: 2026-04-26
