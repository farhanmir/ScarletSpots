# Backend Load Tests

## Purpose

Exercise the backend under realistic parking-app traffic before launch.

## Current script

- `occupancy_peak.js`

## Example run

```bash
k6 run -e BASE_URL=http://localhost:8000/api/v1 occupancy_peak.js
```

## What to watch

- request failure rate
- p95/p99 latency
- websocket stability during concurrent writes
- occupancy/session integrity under burst traffic

## Notes

This directory is scaffolding, not proof that launch-scale validation is complete. Results still need to be run, saved, and reviewed.

Last reviewed: 2026-04-26
