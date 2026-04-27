# WebSocket + Background Parking Architecture

## Purpose

Explain how occupancy changes propagate when sessions start/end, especially when the triggering app is not actively sitting on a live websocket screen.

## Current state

The active product direction is native Swift sensing plus backend websocket fan-out.

High-level path:

```text
Native or foreground action
  -> POST session start/end
  -> backend updates occupancy
  -> backend publishes websocket event
  -> open clients update immediately
```

## Open-app realtime path

- occupancy websocket endpoint is owned by the backend
- clients subscribe while the app is open
- lot counts update without polling

This is the main low-latency path for users currently on the app.

## Background / closed-app path

When the iOS app detects a park or end via native sensing:

1. the native layer resolves the lot and posts the session event
2. the backend commits the session/occupancy write
3. open websocket clients receive the new count
4. local app state, push fan-out, and later foreground refreshes keep other devices aligned

## Important repo note

Some older docs and comments still describe a JS-first background pipeline. Those are historical. The active implementation center is:

- `ios/ScarletSpots/Sources/AutoPark`
- `backend/app/routers/park.py`
- `backend/app/core/websocket.py`
- `backend/app/services/push_notifications.py`

## What this doc is not

This is not a promise that every closed-app device sees an instant full UI update without reopening. It is the architecture note for:
- authoritative writes
- websocket fan-out to active clients
- the native sensing handoff into the backend

Last reviewed: 2026-04-26
