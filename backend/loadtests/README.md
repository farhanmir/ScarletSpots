# Backend Load Tests

## Purpose

Exercise the backend under realistic parking-app traffic before launch.

## Current script

- `occupancy_peak.js`

## Example run

From `backend/loadtests/`:

```bash
k6 run -e BASE_URL=http://localhost:8000/api/v1 occupancy_peak.js
```

## Watch these numbers

- request failure rate
- p95 and p99 latency
- websocket stability while occupancy writes are happening
- session and occupancy integrity under burst traffic

## Operational rule

This directory is a harness, not proof that scale validation is done. Save the results, attach them to release notes, and record any backend limits or follow-up actions.

Last reviewed: 2026-04-26
