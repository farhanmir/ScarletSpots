# ScarletSpots Architecture

## Core rule

Static campus data lives in the app bundle. Dynamic parking state lives on the backend.

That split keeps the app fast, offline-friendly, and cheap to operate.

## Main components

### 1. Native iOS app

Location: `ios/ScarletSpots`

Responsibilities:
- render bundled lot polygons and search data
- apply permit and campus filters locally
- start/end parking sessions
- show active session state
- connect to websocket occupancy updates
- drive background/foreground sensing inputs

Key local data source:
- `ios/ScarletSpots/Resources/scarletspots.sqlite`

### 2. Backend

Location: `backend/app`

Responsibilities:
- auth-backed user/profile access
- parking session lifecycle
- lot occupancy counters
- forecast responses
- pre-launch source/confidence classification for occupancy + forecast display
- friendships and favorites
- websocket fan-out
- push token registration and notification dispatch

### 3. Website

Location: `website/`

Responsibilities:
- landing page
- privacy / terms / support surfaces
- launch-facing product messaging

## Data model split

### Bundled / static
- lots
- lot polygons
- buildings
- places
- permit mappings
- permit schedules

### Backend / dynamic
- profiles
- parking sessions
- lot occupancy
- friendships
- favorites
- push tokens / notification state

## Realtime flow

```text
User parks or ends session
  -> backend updates parking_sessions + lot_occupancy
  -> backend publishes occupancy change
  -> websocket clients update open apps with observed counts
  -> clients preserve pattern-first display until live signal is strong
  -> push / local refresh paths handle closed-app awareness where applicable
```

## Search / map flow

```text
User searches
  -> local SQLite-backed search results
  -> lot result focuses a lot on the map
  -> place/building result drops a temporary destination pin
```

## Forecast flow

```text
Lot selected
  -> native sheet requests /lots/{lot_id}/forecast
  -> backend returns curve/confidence/source metadata
  -> native chart renders expected-pattern bars unless signal is strongly observed
```

## Cleanup note

ScarletSpots is now fully ios. Current implementation truth should be derived from:

1. `ios/`
2. `backend/`
3. `website/`
4. `docs/`

Last reviewed: 2026-04-26
