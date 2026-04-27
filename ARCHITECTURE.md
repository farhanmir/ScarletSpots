# ScarletSpots Architecture

## Core rule

Static Rutgers campus data lives in the iOS bundle. Dynamic parking state lives on the backend.

That keeps the product fast, cheap to operate, and still useful when the network is weak.

## Main components

### 1. Native iOS app

Location: `ios/ScarletSpots`

Responsibilities:

- render bundled lots, polygons, buildings, and places from SQLite
- handle Rutgers-only sign-in and onboarding
- apply permit and campus filters locally
- start and end parking sessions
- show occupancy, forecast, and circling context for lots
- connect to websocket occupancy and notifications channels
- run AutoPark / AutoEnd sensing and diagnostics
- surface Live Activity / widget-adjacent session state

Important local artifacts:

- `ios/ScarletSpots/Resources/scarletspots.sqlite`
- `ios/ScarletSpots/Sources/AutoPark/`
- `ios/ScarletSpots/WidgetExtension/`

### 2. Backend

Location: `backend/app`

Responsibilities:

- auth-backed profile and account APIs
- parking session lifecycle
- occupancy counters
- forecast and current-state metadata
- circling metrics aggregation
- favorites and friendships
- websocket fan-out
- push token registration and push dispatch
- attestation/session token issuance for higher-value access

Primary routers:

- `routers/users.py`
- `routers/lots.py`
- `routers/park.py`
- `routers/friends.py`
- `routers/favorites.py`
- `routers/system.py`
- `routers/websocket.py`

### 3. Website

Location: `website/`

Responsibilities:

- launch-facing messaging
- privacy and terms pages
- support/contact routing
- SEO metadata and crawler assets

## Data split

### Bundled in the app

- lots and capacities
- polygons
- buildings
- places
- permit mappings
- permit schedules

### Served dynamically

- profiles
- parking sessions
- lot occupancy
- forecast metadata
- circling metrics
- friendships
- favorites
- push tokens
- attestation tokens

## Primary runtime flows

### Search and map

```text
User searches
  -> local SQLite query
  -> result resolves to lot / building / place
  -> app focuses map or drops a destination pin
```

### Parking session write

```text
Manual action or AutoPark trigger
  -> iOS posts start/end request
  -> backend updates parking_sessions + lot_occupancy
  -> backend publishes websocket update
  -> open clients refresh immediately
  -> push / foreground refresh keeps closed clients aligned later
```

### Occupancy display

```text
Backend computes current lot payload
  -> mixes observed session signal with typical-pattern fallback
  -> returns source/confidence/display_mode metadata
  -> iOS decides whether to show live-looking numbers or pattern-style status text
```

### Forecast

```text
Lot selected
  -> iOS requests /lots/{lot_id}/forecast
  -> backend returns current-state metadata + forecast slices/curve
  -> chart and lot detail sheet render the response
```

### Higher-value access

```text
Signed-in client requests attestation session
  -> backend issues short-lived token
  -> client includes token on sensitive availability/ws flows when enabled
```

## Trust order

When docs disagree, derive current truth from:

1. `ios/`
2. `backend/`
3. `website/`
4. refreshed markdown in the repo root and `docs/`

Last reviewed: 2026-04-26
