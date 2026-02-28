# ScarletSpots - Project Plan (Original, Pre-Pivot)

> **Source**: Commit `f5465d3` — "docs: add PLAN.md, readme2.md and update README.md" (Feb 14, 2026)
> **Status**: Historical archive. This was the original feature blueprint before the architecture pivot.
>            See the current `PLAN.md` for what was built.

---

## Project Overview
ScarletSpots is a smart parking application designed to help users find and share parking information, particularly focused on campus environments. The app combines location tracking, social features, and crowd-sourced data to create a comprehensive parking solution with a strong real-time and predictive layer.

---

## 1. Native Architecture
- Frontend: Expo (React Native) + TypeScript
- Maps: react-native-maps
  - iOS: Apple Maps (MKMapView)
  - Android: Google Maps
- Sensors: expo-location (GPS) + expo-sensors (Magnetometer)
- Backend API: FastAPI
- Database: PostgreSQL with PostGIS
- Auth and realtime: Supabase (sessions, row-level security, subscriptions)
- Notifications: Expo push notifications

## 2. Dual-Map Strategy
Use react-native-maps to auto-select the platform map provider.

```ts
import MapView, { PROVIDER_GOOGLE, PROVIDER_DEFAULT } from 'react-native-maps';
import { Platform } from 'react-native';

const ParkingMap = () => {
  const mapProvider = Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;

  return (
    <MapView
      provider={mapProvider}
      style={{ flex: 1 }}
      showsUserLocation={true}
    />
  );
};
```

## 3. Intelligent Parking Detection System
**Objective:** Automatically detect and log where users park their vehicles with minimal manual input.

**Implementation Details:**
- **Geofencing integration:** Mark designated parking lots as polygons and start tracking when a user enters a lot boundary.
- **Automatic location logging:** When the device enters a lot, begin a parking session with a rolling location buffer.
- **Smart exit detection (multi-signal):**
  - Bluetooth disconnection from car audio/systems
  - Significant movement patterns indicating walking
  - GPS velocity and acceleration changes that indicate parking and then walking
- **User confirmation flow:**
  - When parking is detected, the app pins the approximate location.
  - Prompts the user to confirm the exact spot, with drag-to-adjust for accuracy.
  - Allows manual adjustment to compensate for 1-2 spot drift.
- **GPS accuracy compensation:**
  - Use accuracy radius to avoid over-confident pins.
  - Fall back to spot centroid if GPS is too noisy.

**User Benefits:**
- Hands-free parking location tracking
- Never forget where you parked
- Automatic logging reduces cognitive load

## 4. Common Commuter Spots Database
**Objective:** Pre-populate the app with frequently visited campus locations to enhance navigation and parking recommendations.

**Location Categories:**
- Student centers
- Athletic facilities
- Major classrooms and lecture halls
- Administrative buildings
- Other high-traffic areas

**Implementation:**
- Database of pre-mapped locations with coordinates and metadata.
- Integration with parking detection to suggest nearby parking for destinations.
- Allow users to set favorites and recent destinations for quick access.

## 5. Knight Needle (Compass)
**Objective:** Provide a close-range, glanceable compass for final navigation to the parked car.

**Core math:**
- Bearing: angle from user to car
- Heading: phone direction from Magnetometer
- Arrow rotation: bearing - heading

**UI:**
- Center red lance
- Distance text
- Haptic thud on lock-on

Pseudo-loop:
```ts
useEffect(() => {
  Magnetometer.addListener((data) => {
    const phoneHeading = calculateHeading(data);
    const targetBearing = calculateBearing(userLocation, carLocation);
    setArrowRotation(targetBearing - phoneHeading);
  });
}, [userLocation, carLocation]);
```

## 6. Virtual Grid (Mobile Flow)
### Park Flow (Input)
- Geofence triggers on the lot boundary and starts a parking session.
- Accelerometer detects driving -> walking transition.
- App highlights the 3 closest plausible spots.
- Prompt: confirm a specific spot or adjust.

### Find Flow (Output)
- Far away: map + scarlet pin
- Close range (< 500 ft): auto-switch to compass mode

## 7. Map Intelligence: Heat Maps and Rush-Hour Prediction
**Heat map of full areas:**
- Visualize lot density by cell or zone using a heat map overlay.
- Red or scarlet clusters represent near-full or full sub-areas.
- Data sources: recent parking confirmations, active sessions, and manual crowd reports.
- Update cadence: real-time where possible; otherwise batch updates every few minutes.

**Rush-hour prediction:**
- Use historic occupancy and arrival patterns to predict high-demand windows.
- Identify daily and weekly peaks per lot and display to users as a timeline.
- Provide a simple label: low, medium, high, full, based on percentile thresholds.

## 8. Social Features and Friend Integration
**Objective:** Add social connectivity to make parking a collaborative experience.

**Features:**
- User accounts and authentication (email + password or OAuth via Supabase).
- Friend system with privacy controls for sharing parking data.
- Friend parking visibility: highlight the exact spot where a friend parked.
- Optional: show friend markers only in the same lot to avoid map clutter.

**User-facing behavior:**
- On the map, highlight spots where friends parked their cars.
- Provide a quick filter: show all spots or only friends.

## 9. Accounts, Auth, and Friend Data Model
**Accounts:**
- Supabase auth for sign-up, login, session refresh, and password reset.
- Row-level security rules to protect private parking sessions and friend data.

**Signup restriction (Rutgers-only):**
- Only allow sign-ups from email addresses ending with `@rutgers.edu` or `@scarletmail.rutgers.edu`.
- Rationale: restricts the userbase to the campus community to reduce spam and abuse, protect privately shared campus location data, simplify verification and moderation, and improve the quality and trustworthiness of crowd-sourced parking data. Enforcing university-only signups lowers legal/moderation risk and ensures features (friend networks, lot access, campus-specific forecasting) remain relevant.
- Implementation note: enforce domain whitelist at signup (Supabase/email verification and OAuth provider rules) and validate on the backend (RLS or signup hook).

**Friend relationships:**
- Friend requests: pending, accepted, blocked.
- Bidirectional relationships with explicit consent.

**Data access rules:**
- Users can only see their own sessions, or friends who accepted sharing.
- Location sharing can be toggled per friend.

## 10. Backend Blueprint (FastAPI)
```
backend/
├── main.py
├── services/
│   ├── geo/
│   │   ├── geometry.py
│   │   ├── virtual_grid.py
│   │   └── geofence.py
│   ├── users/
│   │   ├── vehicle.py
│   │   └── preferences.py
│   ├── predictions/
│   │   ├── rush_hour.py
│   │   └── heat_map.py
│   └── social/
└── data/
    └── parking_zones/
```

Key endpoints:
- POST /api/park/session
- GET /api/park/compass
- GET /api/lot/{id}/forecast
- GET /api/lot/{id}/heatmap
- GET /api/lot/{id}/rush-hours

## 11. Database Schema (Preliminary)
- Users: user_id, username, email, password_hash, created_at
- Parking_Spots: spot_id, lot_id, coordinates, user_id, timestamp, confirmed
- Parking_Sessions: session_id, user_id, lot_id, start_time, end_time, confidence_score
- Lots: lot_id, name, coordinates, boundary_polygon, capacity
- Friends: friendship_id, user_id_1, user_id_2, status, created_at
- Common_Locations: location_id, name, type, coordinates, building_name
- Heatmap_Cells: cell_id, lot_id, cell_polygon, occupancy_score, updated_at
- Rush_Hour_Stats: lot_id, day_of_week, hour, avg_occupancy, peak_score

## 12. Forecasting Engine (1 Hour Ahead)
- Timeline scrubber: now, +15m, +30m, +60m
- Now: real-time occupancy
- Future: historical average + current inflow rate * minutes
- Output: confidence band and predicted availability label per lot

## 13. Visual Design (Themes)
### Campus Mode (Default)
- Standard maps
- Thin needle compass
- White background, black text, Rutgers red accents

### Knight Mode (Retro)
- Dark custom map style
- 8-bit pixel lance
- JetBrains Mono
- Cyberpunk / Pip-Boy vibe

## 14. Development Phases
### Phase 1: MVP Foundation
- Init Expo app with TypeScript and map provider configuration.
- Lot geofences, parking sessions, and manual spot confirmation.
- Supabase auth setup with secure session handling.
- Core database schema and basic API endpoints.

### Phase 2: Social and Friend Layer
- Friend requests, acceptance, and privacy settings.
- Friend parking highlights on the map.
- Data rules for who can view what.

### Phase 3: Predictive and Heat Map Layer
- Heat map overlay per lot.
- Rush-hour prediction using historical data.
- Forecast view for the next hour.

### Phase 4: Polish and Optimization
- Background geofencing and battery tuning.
- Compass mode refinements and haptics.
- UI/UX improvements based on user feedback.

## 15. Success Metrics
- User adoption and retention rates
- Number of parking spots logged daily
- Friend network growth
- App engagement time and frequency
- Accuracy of occupancy and prediction labels

## 16. Future Considerations (Post-Launch Only)
### ScarletSpots Premium: Ticket Reporting and Enforcement Insights
**Status:** Not in scope until all core features are complete and stable.

**Concept:**
- Ticket reporting system: users report tickets with lot, time, date, and agency.
- Real-time alerts: notify users currently parked in that lot.
- Enforcement analytics: identify lots and times with higher enforcement activity.
- Parking recommendations: suggest lower-risk lots or safer time windows.

**Monetization direction:**
- Subscription positioned as cheaper than parking permits.
- Revenue supports ongoing development and data operations.

## 17. Future Considerations
- Integration with navigation apps (Google Maps, Apple Maps deep-link hand-off)

## 18. Admin Web Interface (Dev/Ops Dashboard)
**Objective:** A web-based portal for developers and administrators to manage the parking system, visualize data, and configure geofences without needing the mobile app.

**Target Audience:** Developers, Admins, Rutgers Parking Operations.

**Core Features:**
1. **Geofence Management Editor:**
   - Visual editor to draw, edit, and save parking lot polygons.
   - Adjust capacity and metadata for each lot.
   - "Test Mode": Simulate entering/exiting geofences.

2. **Live Heatmap & Analytics:**
   - Desktop-optimized view of the campus map.
   - Real-time visualization of active parking sessions.
   - Historical occupancy graphs (Rush Hour analysis).

3. **User & System Management:**
   - View/Manage user accounts (ban/unban).
   - Monitor system health (API latency, sensor accuracy reports).
   - Manage "Common Commuter Spots" database.

**Tech Stack:**
- **Frontend:** React + Vite (The current prototype codebase).
- **Map:** Leaflet (perfect for desktop admin tasks).
- **Backend:** Connects to the same Supabase/FastAPI backend as the mobile app.
