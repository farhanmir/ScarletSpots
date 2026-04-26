# Popular Lots — Search Page

The "Popular Lots" section on the Search tab is meant to show the lots the
user (or the wider Rutgers community) parks in most often. Today, both the
SwiftUI app and the React Native app fall back to a static "first 6 lots
from the bundled dataset" placeholder. This doc captures the planned
upgrade to a real, usage-driven ranking so we don't lose the design context.

## Status (2026)

| Surface              | Source                                                 | File                                                                                                             |
| -------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| iOS native (SwiftUI) | `LotRepository.shared.getAll(...).prefix(6)`           | [`ios-native/ScarletSpots/Sources/Features/Search/SearchScreen.swift`](../ios-native/ScarletSpots/Sources/Features/Search/SearchScreen.swift) |
| React Native         | `getAllLots(ENABLE_ALL_CAMPUSES).slice(0, 6)`          | [`mobile/src/features/home/screens/SearchScreen.tsx`](../mobile/src/features/home/screens/SearchScreen.tsx)      |
| Backend              | _(none — no `/lots/popular` endpoint yet)_             | [`backend/app/routers/lots.py`](../backend/app/routers/lots.py)                                                  |

Until this doc's plan is implemented, the placeholder is intentional and
matches across platforms so neither app regresses relative to the other.

## Goal

Show 6 lots ordered by how frequently they're actually parked in, with two
tiers of personalization:

1. **Personal** — the lots _this user_ has parked in most over the last 30
   days. Falls back gracefully when the user is signed-out or has no
   history.
2. **Global** — when the personal list is empty (or to fill out fewer than
   6 personal results), top up with the most-parked lots across all users
   in the same campus filter.

We already capture the data we need: every confirmed park-in writes a
`parking_session` row with `lot_id`, `user_id`, and `started_at`.

## Proposed backend endpoint

```
GET /lots/popular?limit=6&campus=NB
```

### Response

```json
{
  "personal": ["lot_123", "lot_456"],
  "global":   ["lot_789", "lot_111", "lot_222", "lot_333"],
  "generated_at": "2026-04-26T11:00:00Z"
}
```

### Ranking SQL (sketch)

Personal:

```sql
SELECT lot_id, COUNT(*) AS visits
FROM parking_session
WHERE user_id = :user_id
  AND started_at >= NOW() - INTERVAL '30 days'
  AND lot_id IS NOT NULL
GROUP BY lot_id
ORDER BY visits DESC
LIMIT :limit;
```

Global (campus-scoped):

```sql
SELECT ps.lot_id, COUNT(*) AS visits
FROM parking_session ps
JOIN lot l ON l.map_id = ps.lot_id
WHERE ps.started_at >= NOW() - INTERVAL '30 days'
  AND ps.lot_id IS NOT NULL
  AND (:campus IS NULL OR l.region_code = :campus)
GROUP BY ps.lot_id
ORDER BY visits DESC
LIMIT :limit;
```

The handler returns the personal list first, then pads with global entries
that aren't already in the personal list, until we have `limit` IDs.

### Caching

- Cache the global list per-campus for 1 hour in Redis.
- Personal list isn't cached server-side — it's user-specific and changes
  whenever they finish a session.

## Client integration

### iOS native

In [`SearchScreen.swift`](../ios-native/ScarletSpots/Sources/Features/Search/SearchScreen.swift),
replace `popularResults` with:

1. A new `PopularLotsAPI` call to `GET /lots/popular`.
2. Map the returned IDs through `LotRepository.shared.byId(_:)` to get
   the full `Lot` rows the row component already understands.
3. Cache the response on disk for 24h via `OfflineCache`, so a flaky
   connection still surfaces a list.
4. Fall back to the current `lots.prefix(6)` static slice when the cache
   is cold AND the network call fails.

### React Native

Same pattern in
[`mobile/src/features/home/screens/SearchScreen.tsx`](../mobile/src/features/home/screens/SearchScreen.tsx):
swap `STATIC_LOTS.slice(0, 6)` for a `useQuery(['popular-lots', campus])`
call backed by the same endpoint, with the same offline cache fallback.

## Out of scope

- Time-of-day weighting (e.g., "popular for Tuesday morning"). Useful but
  noisy at our current data volume — revisit when we have ≥ 1k DAU.
- Building / destination-aware popularity (e.g., "lots most parked near
  the Werblin Rec Center"). Would require a geocoder pass on the user's
  destination; tracked separately.
