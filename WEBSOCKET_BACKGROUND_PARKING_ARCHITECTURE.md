# WebSocket + Background Parking Architecture

## Purpose

Explain how occupancy changes propagate when a session starts or ends, including cases where the triggering app is not sitting on a foreground map screen.

## Current stack

The shipping direction is native iOS sensing plus backend websocket fan-out.

```text
Manual park/end or AutoPark event
  -> POST /api/v1/park/session or /api/v1/park/session/end
  -> backend mutates parking_sessions + lot_occupancy
  -> backend publishes websocket update
  -> open clients refresh immediately
```

## Open-app realtime path

- `/ws/occupancy` handles authenticated lot subscriptions
- `/ws/notifications` handles authenticated notification events
- occupancy writes publish immediately to subscribed open clients
- the client can keep pattern-first display semantics even while receiving live updates

## Background / closed-app path

When the native app detects a likely park or departure:

1. AutoPark resolves the event and posts a session write
2. the backend commits the occupancy mutation
3. websocket-connected clients receive the changed count
4. silent push, local persistence, and later foreground refreshes help other devices converge

## Important code centers

- `ios/ScarletSpots/Sources/AutoPark/`
- `ios/ScarletSpots/Sources/Services/NativeSessionStore.swift`
- `backend/app/routers/park.py`
- `backend/app/routers/websocket.py`
- `backend/app/core/websocket.py`
- `backend/app/services/push_notifications.py`

## Non-goals of this document

This is not a promise that every closed app redraws its UI instantly.

It documents:

- authoritative session writes
- occupancy fan-out to open clients
- the handoff between native sensing, backend truth, and later resync paths

Last reviewed: 2026-04-26
