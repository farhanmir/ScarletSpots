# PR: ScarletSpots "Native Magic" Architectural Pivot 🚀

## 🎯 Goal
Transform the ScarletSpots background parking engine and map visualization from a brittle, JavaScript-polling prototype into a high-performance, native-first iOS system. This pivot eliminates battery drain, bridge bottlenecks, and frequent "index beyond bounds" crashes.

## 🏗️ Major Changes

### 1. The "ParkingMagic" Swift Engine
- **[NEW] Local Expo Module**: Created `modules/parking-magic` to house all silicon-layer logic.
- **Hardware-Layer Sensing**:
  - **Bluetooth/CarPlay**: Atomic disconnect signals using `AVAudioSession`.
  - **Core Motion**: Precision `Driving` → `Walking` transitions using `CMMotionActivityManager`.
  - **PIP Engine**: Native Swift Point-In-Polygon engine for zero-bridge lot identification.
- **Reliability**:
  - **Transactional Queue**: Native SQLite-backed offline queue for concrete garages.
  - **Significant Location Changes**: Low-power anchor to keep the app alive indefinitely in the background.

### 2. Vision & UX Engine
- **MapKit Integration**: Replaced `react-native-maps` with a custom Swift `MKMapView` for 120Hz performance.
- **Live Activities**: Integrated `ActivityKit` for Lock Screen and Dynamic Island navigation.
- **Haptic Guidance**: Added `CoreHaptics` for "Hot/Cold" guidance to the user's car.

### 3. Backend & Sync
- **Silent Pushes**: Implemented `content-available: 1` APNs notifications to keep all devices in sync without user interaction.
- **Vulture Mode**: Silicon-layer searching behavior reporting for advanced occupancy forecasting.
- **Confidence Intervals**: Updated Python APIs to provide explicit error ranges (± 3%).

### 4. Technical Debt Purge (The "Deep Clean")
Deleted 1,000+ lines of brittle/legacy code:
- Deleted `GeofenceManager.ts` (Geofencing is now Native).
- Gutted `BackgroundTasks.ts` (Polling loops removed).
- Gutted `activitySignals.ts` (Mailbox hacks removed).

## ⚠️ Important for Deployment
- **Expo Go is no longer supported**.
- Requires **Development Build** (`npx expo run:ios`).
- Requires **Physical Device** with Motion & Location permissions enabled.

---
**Status**: Ready for prebuild and device testing.
