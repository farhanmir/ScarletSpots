# Load Tests

## Occupancy Peak Test (k6)

Script: `occupancy_peak.js`

### Run locally

```bash
k6 run -e BASE_URL=http://localhost:8000/api/v1 occupancy_peak.js
```

### Goal

Exercise the public occupancy endpoint under peak read pressure while tracking:

- request failure rate
- p95 latency
- backend stability during sustained concurrency
