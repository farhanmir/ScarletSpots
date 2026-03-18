# WebSocket + Background Parking Architecture

## Problem

Background auto-parking can trigger while the app is closed. Occupancy and notifications still need to propagate reliably.

## Current Solution

ScarletSpots uses API writes plus Redis pub/sub fanout to websocket clients.

```text
Background or foreground park action
  -> POST /api/v1/park/session
  -> backend writes session + occupancy
  -> backend publishes Redis event
  -> websocket manager broadcasts to connected clients
```

## Auth Layer

WebSocket auth now uses Keycloak access token verification:

1. client connects to websocket endpoint
2. client sends auth payload containing bearer token
3. backend validates JWT (issuer/JWKS)
4. connection is registered for occupancy or notification channels

## Delivery Modes

- App open: websocket receives near-real-time events
- App closed: push notifications provide awareness
- Background task triggers: still goes through API, so redis/websocket broadcast remains consistent

## Push Integration

Current push foundation:

- device tokens stored in `device_push_tokens`
- backend dispatches via Expo push APIs
- parking events can notify owner/friends depending on flow

## Reliability Notes

- Redis channel fanout decouples API writes from websocket clients
- failed websocket clients are pruned by connection manager
- all critical state remains source-of-truth in Postgres tables

## Operational Checks

After deploy/recovery:

1. validate websocket auth with Keycloak token
2. start session from one client and observe occupancy update on another
3. verify push token registration and dispatch path
