# ScarletSpots Native Masterplan

## 1. Native Architecture
- Frontend: Expo (React Native) + TypeScript
- Maps: react-native-maps
  - iOS: Apple Maps (MKMapView)
  - Android: Google Maps
- Sensors: expo-location (GPS) + expo-sensors (Magnetometer)
- Backend: FastAPI + PostgreSQL (PostGIS)

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

## 3. Knight Needle (Compass)
- Bearing: angle from user to car
- Heading: phone direction from Magnetometer
- Arrow rotation: bearing - heading
- UI: center red lance + distance text + haptic thud on lock-on

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

## 4. Virtual Grid (Mobile Flow)
### Park Flow (Input)
- Geofence triggers on Yellow Lot boundary
- Accelerometer detects driving -> walking
- App highlights 3 closest empty spots
- Prompt: confirm a specific spot

### Find Flow (Output)
- Far away: map + scarlet pin
- Close range (< 500 ft): auto-switch to compass mode

## 5. Backend Blueprint (FastAPI)
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
│   └── social/
└── data/
    └── parking_zones/
```

Key endpoints:
- POST /api/park/session
- GET /api/park/compass
- GET /api/lot/{id}/forecast

## 6. Forecasting Engine (1 Hour Ahead)
- Timeline scrubber: now, +15m, +30m, +60m
- Now: real-time occupancy
- Future: historical average + current inflow rate * minutes

## 7. Visual Design (Themes)
### Campus Mode (Default)
- Standard maps
- Thin needle compass
- White background, black text, Rutgers red accents

### Knight Mode (Retro)
- Dark custom map style
- 8-bit pixel lance
- JetBrains Mono
- Cyberpunk / Pip-Boy vibe

## 8. Implementation Roadmap
### Phase 1: Foundation
- Init Expo app with TypeScript
- Install react-native-maps, configure keys
- Setup FastAPI + parking_sessions table

### Phase 2: Data Layer
- GeoJSON grid for Yellow Lot spots
- Nearest-spot snapper endpoint

### Phase 3: Knight Needle
- Magnetometer integration
- Bearing math
- SVG arrow rotation

### Phase 4: Polish
- Background geofencing
- Forecast slider wiring
