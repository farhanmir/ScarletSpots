# WebSocket + Background Parking Architecture

## Problem Statement

When a user auto-parks with the app **closed**, how do:
1. Other users see the occupancy change in real-time?
2. Friends get notified the user just parked nearby?

WebSockets only work when the app is **open**. Background tasks don't maintain persistent connections.

## Solution: Dual-Path Occupancy Broadcasting

### Path 1: Background Auto-Park → Redis → WebSocket Clients ✓

When background detection triggers auto-parking:

```
[Background Task: /park/session API call]
         ↓
[Backend: Session stored in DB]
         ↓
[Backend: publish_occupancy_update() → Redis]
         ↓
[Redis pub/sub: broadcast to connected WebSocket clients]
         ↓
[Users with app OPEN on that lot see occupancy update immediately]
```

**This works because:**
- [park.py:143](backend/app/routers/park.py#L143) calls `ws_manager.publish_occupancy_update(changed_lot_id, count)` when ANY session starts/ends
- Whether the `/park/session` call came from:
  - Mobile WebSocket (user manually parked) ✓
  - Mobile API (background detection) ✓
  - **Both paths trigger occupancy broadcast**

### Path 2: Background Auto-Park → Local Notification ✓

```
[Background Detection Task]
         ↓
[Confidence threshold met]
         ↓
[POST /park/session (API, no WebSocket)]
         ↓
[Send local notification to device]
         ↓
[User sees "We detected your parking at Lot X"]
         ↓
[User can tap to open app and confirm]
```

[See BackgroundTasks.ts:182](mobile/src/shared/services/BackgroundTasks.ts#L182)

---

## Push Notifications: Implemented Base Layer ✅

**Scenario:** User parks while app is closed. Another user is viewing the **same lot** with app open.

**Current behavior:**
- ✓ User A's session is stored on backend
- ✓ Occupancy is published to Redis
- ✓ User B receives occupancy update (app is open, has WebSocket)
- ✓ User A gets local notification

**Missing scenario:** User A parks. User C is viewing the **same lot** but **app is closed**.
- ❌ User C doesn't see occupancy change (app is closed, no WebSocket)
- ❌ User C doesn't get notified unless they have push notifications enabled

### Implemented Solution: Expo Push Service (FCM/APNs under the hood)

Current implementation:

1. **Mobile:** Requests notification permission and syncs Expo push token at login
  - [PushRegistration.ts](mobile/src/shared/services/PushRegistration.ts)
  - [AuthProvider.tsx](mobile/src/providers/AuthProvider.tsx)
2. **Backend:** Stores user → device token mappings
  - Table: `device_push_tokens`
  - Model: [push.py](backend/app/models/push.py)
  - Router endpoints:
    - `POST /api/v1/users/me/push-token`
    - `DELETE /api/v1/users/me/push-token`
3. **Backend:** Dispatches push notifications via Expo Push API
  - [push_notifications.py](backend/app/services/push_notifications.py)
4. **Session start flow:** Sends pushes for closed-app awareness
  - User gets push when session auto-starts
  - Friends get push when a friend parks
  - Hooked in [park.py](backend/app/routers/park.py)

**Remaining backlog:** occupancy-threshold/favorite-lot alerts (e.g. "lot almost full") and iOS Live Activities.

---

## Current Architecture Summary

| Scenario | User Status | Occupancy Update | Notification |
|----------|------------|-----------------|--------------|
| Manual park | App open | WebSocket (real-time) | N/A |
| Manual park | App closed | None until reopens | None |
| Auto-park detection | App open | WebSocket (real-time) | Local |
| Auto-park detection | App closed | None until reopens | Local only |
| Friend parks | Your app open | WebSocket (real-time) | WebSocket |
| Friend parks | Your app closed | None until reopens | Push notification (implemented) |

---

## Implementation Checklist

### ✓ Completed
- [x] WebSocket occupancy broadcasting via Redis pub/sub ([websocket.py](backend/app/core/websocket.py))
- [x] Backend publishes occupancy on session start/end ([park.py:143, 182](backend/app/routers/park.py#L143))
- [x] Background auto-park detection ([BackgroundTasks.ts](mobile/src/shared/services/BackgroundTasks.ts))
- [x] Local notifications for detected parking ([BackgroundTasks.ts:182](mobile/src/shared/services/BackgroundTasks.ts#L182))
- [x] Push token registration + backend storage ([PushRegistration.ts](mobile/src/shared/services/PushRegistration.ts), [push.py](backend/app/models/push.py))
- [x] Push dispatch for auto-start and friend parking ([push_notifications.py](backend/app/services/push_notifications.py), [park.py](backend/app/routers/park.py))

### ⏳ Roadmap (Phase C+)
- [ ] Occupancy threshold push alerts (favorites / watched lots)
- [ ] iOS Live Activity updates for auto-started sessions
- [ ] Rich notification payload routing (deep links, action buttons)

---

## Key Takeaway

**Auto-parking with WebSocketless background detection broadcasts to open app users via Redis and now notifies closed-app users via push.** WebSockets remain for low-latency in-app realtime; push covers offline/closed-app delivery.

