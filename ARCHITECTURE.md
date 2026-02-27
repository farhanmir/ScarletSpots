# ScarletSpots — Architecture

> Technical reference for the data model, API contract, and system flows.

---

## Principle

**Static data lives in the app. Dynamic data lives in the database.**

The `rutgers_parking_data.json` file (1.4 MB, bundled in the mobile app) contains everything that doesn't change: lot names, coordinates, polygon boundaries, capacity, photos, campus info. The database only stores what changes: sessions, occupancy counts, friendships.

---

## Data Model

### Database Tables (Supabase / PostgreSQL)

```sql
profiles
  id          UUID PRIMARY KEY  -- mirrors auth.users.id
  email       TEXT NOT NULL
  full_name   TEXT
  avatar_url  TEXT
  created_at  TIMESTAMPTZ

parking_sessions
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY
  user_id     UUID REFERENCES profiles(id)
  lot_id      TEXT NOT NULL     -- JSON mapId e.g. "10001"
  spot_number TEXT
  latitude    FLOAT
  longitude   FLOAT
  active      BOOLEAN DEFAULT true
  start_time  TIMESTAMPTZ
  end_time    TIMESTAMPTZ
  created_at  TIMESTAMPTZ
  -- Index: (user_id, active) WHERE active = true
  -- Index: (lot_id, active)  WHERE active = true

lot_occupancy
  lot_id      TEXT PRIMARY KEY  -- JSON mapId e.g. "10001"
  count       INTEGER DEFAULT 0 CHECK (count >= 0)
  updated_at  TIMESTAMPTZ
  -- Realtime enabled (REPLICA IDENTITY FULL)

friendships
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY
  user_id         UUID REFERENCES profiles(id)
  friend_id       UUID REFERENCES profiles(id)
  status          TEXT  -- 'pending' | 'accepted' | 'blocked'
  sharing_enabled BOOLEAN DEFAULT true
  created_at      TIMESTAMPTZ

user_favorites
  id       UUID DEFAULT gen_random_uuid() PRIMARY KEY
  user_id  UUID REFERENCES profiles(id)
  lot_id   TEXT NOT NULL     -- JSON mapId
  created_at TIMESTAMPTZ
```

### Bundled Static Data (rutgers_parking_data.json)

Each entry in the JSON:
```typescript
{
  mapId: string;          // Primary key — used as lot_id everywhere
  propertyName: string;   // Full name e.g. "Lot 613 Stadium West"
  shortName: string;      // Display name e.g. "Lot 613"
  active: boolean;
  address: {
    campus: string;       // "Busch" | "College Ave" | "Livingston" | etc.
    regionCode: string;   // "NB" | "NW" | "CM"
  };
  location: { lat: number; lng: number };
  totalSpaces: number;
  generalAvailable: number;
  handicapped: number;
  evCharging: number;
  garage: boolean;
  student: boolean;
  employee: boolean;
  photos: string[];
  gtfsGeometry: {
    type: "Polygon";
    coordinates: [number, number][][];  // GeoJSON [lng, lat]
  };
}
```

### TypeScript Lot Type (`mobile/data/lots.ts`)

```typescript
interface RutgersLot {
  id: string;           // mapId
  name: string;         // propertyName
  shortName: string;
  campus: string;
  latitude: number;
  longitude: number;
  capacity: number;     // totalSpaces
  coordinates: [number, number][];  // [lat, lng] — converted from GeoJSON
  // ...additional fields
  occupiedCount: number;  // From lot_occupancy table (runtime)
  occupancyRate: number;  // Calculated (0–100)
}
```

---

## API Contract

Base URL: `/api/v1`

### Auth Headers

All authenticated endpoints require:
```
Authorization: Bearer <supabase_access_token>
apikey: <supabase_anon_key>
```

### Key Endpoints

#### Start Parking Session
```
POST /park/session
Content-Type: application/json

{
  "lotId": "10001",           // JSON mapId string
  "spotNumber": "Auto-detected",
  "latitude": 40.5138,
  "longitude": -74.4646,
  "confirmed": true
}

Response:
{
  "success": true,
  "confirmedOccupancy": 45,    // DB-confirmed count after RPC
  "session": {
    "id": "uuid",
    "lotId": "10001",
    "spotNumber": "Auto-detected",
    "startTime": "2026-03-10T12:00:00Z",
    "active": true
  }
}
```

#### Get Forecast
```
GET /lots/{lot_id}/forecast?capacity=250&current_occupancy=45

Response:
{
  "slices": {
    "now": { "time": "...", "expected_occupancy": 72.1, "low": 67.0, "high": 77.2, "label": "high" },
    "15m": { ... },
    "30m": { ... },
    "60m": { ... }
  },
  "curve": [ { "time": "...", "expected_occupancy": 68.0, ... }, ... ],
  "metadata": { "is_weekend": false, "generated_at": "...", "source": "ml" }
}
```

#### Get Friends
```
GET /friends

Response:
{
  "friends": [
    {
      "id": "friendship-uuid",
      "friend_id": "user-uuid",
      "name": "Jane Doe",
      "status": "Parked at Lot 10001",
      "parked": true,
      "lot_id": "10001",          // Use getLotById("10001") to get lot details
      "sharing_enabled": true
    }
  ],
  "requests": [ ... ]
}
```

---

## Data Flow Diagrams

### App Startup
```
1. Module init
   └── STATIC_LOTS = getAllLots()     ← from bundled JSON, 0 network
       └── 193 NB lots pre-computed

2. useQuery(['lots_occupancy'])
   └── supabase.from('lot_occupancy').select('lot_id, count')
       └── 1 small HTTP request
       └── applyOccupancy(STATIC_LOTS, map)

3. Realtime subscribe 'lot_occupancy'
   └── supabase.channel('lot-occupancy-changes')
       └── On INSERT/UPDATE: update in-memory lot data → re-render markers
```

### Session Lifecycle
```
User taps Park
  └── POST /park/session {lotId: "10001"}
      └── Backend: rpc('increment_lot_occupancy', {p_lot_id: "10001"})
          └── lot_occupancy.count++ (atomic, UPSERT)
          └── Realtime pushes change to all clients
      └── INSERT parking_sessions {user_id, lot_id: "10001", active: true}
  └── Mobile: optimistic update → anchor to confirmedOccupancy

User taps End
  └── POST /park/session/end
      └── Backend: rpc('decrement_lot_occupancy', {p_lot_id: "10001"})
          └── lot_occupancy.count = MAX(0, count-1) (atomic)
          └── Realtime pushes change
      └── UPDATE parking_sessions SET active=false
```

### Compass
```
User opens Navigate tab
  └── GET /park/session/active → {lotId: "10001"}
  └── getLotById("10001") → {latitude: 40.5138, longitude: -74.4646}
      └── from bundled JSON, 0 network calls

GPS position watcher + magnetometer/heading watcher (device sensors)
  └── getBearing(userLat, userLng, lotLat, lotLng) → degrees
  └── Animated.Value.setValue(bearing - heading) → arrow rotation
  └── getDistance(...) → "0.3 mi" display
```

### Friends
```
User opens Friends tab
  └── GET /friends (1 API call)
      └── For each friend with sharing_enabled:
          Backend checks parking_sessions WHERE user_id=friend, active=true
          Returns lot_id (JSON mapId string) if parked

User taps "Locate" on parked friend
  └── getLotById(friend.lot_id) → {latitude, longitude}
  └── router.push('/(tabs)/', { selectedLotId: friend.lot_id })
      └── Map tab zooms to that lot, opens lot details
```

---

## Realtime Architecture

Supabase Realtime is used for occupancy push updates only.

```
Client subscribes:
  supabase.channel('lot-occupancy-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lot_occupancy' }, ...)
    .subscribe()

Server triggers:
  Any INSERT/UPDATE to lot_occupancy (via RPCs on session start/end)
  → Supabase broadcasts to all subscribed clients
  → Client updates lot.occupiedCount and lot.occupancyRate in React Query cache
  → Map markers re-render with new percentage
```

Channel cleanup on unmount:
```typescript
useEffect(() => {
  if (!isFocused) return;
  const channel = supabase.channel('lot-occupancy-changes').on(...).subscribe();
  return () => { supabase.removeChannel(channel); };
}, [isFocused, queryClient]);
```

---

## Offline Strategy

| Data | Offline behavior |
|------|-----------------|
| Lot metadata (names, polygons) | Always available (bundled in app) |
| Live occupancy counts | Shows last-known counts from React Query cache |
| Active session | Cached in AsyncStorage (5-min TTL) |
| Park action (start) | Queued to OfflineQueue, synced on reconnect |
| End session action | Queued to OfflineQueue, synced on reconnect |
| Friends list | Not available offline (non-critical) |

---

## Forecasting

### Heuristic (launch)

`HeuristicForecastProvider` — time-of-day + day-of-week profile for Rutgers class schedule patterns. Blends with current occupancy (momentum fades over 2 hours).

### ML model (after data accumulates)

`MLForecastProvider` — gradient boosting (scikit-learn) per lot, trained on historical `parking_sessions` grouped by lot × hour × day_of_week.

Training: `python -m app.services.train_forecast_model`

Models land in `backend/app/services/forecast_models/{lot_id}.joblib` and are loaded lazily. If no model exists for a lot, falls back to heuristic.

---

## Security

- All write endpoints require valid Supabase JWT
- RLS on all tables — users can only see/modify their own data
- `lot_occupancy` readable by anyone (public), writable only by service role (via RPCs)
- `session_feedback` write-only for the owning user
- Rutgers-only email validation on signup and password reset
- Rate limiting via SlowAPI on sensitive endpoints (signup, park, password reset)
