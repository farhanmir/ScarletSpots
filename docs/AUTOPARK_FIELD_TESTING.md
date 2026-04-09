# Auto-park field testing (without driving to campus)

Use these flows to validate geofence wake, background location, and the detection pipeline on a **physical iPhone**. The iOS Simulator is weak for gesture-heavy flows and imperfect for background location.

## 1. Xcode GPX (full OS path)

1. Connect the device, open the **native** project (`expo prebuild` / EAS dev client), and run from Xcode.
2. In Xcode: **Debug → Simulate Location → Add GPX Fixture to Project**, or select an existing route.
3. Build a GPX that passes near a lot coordinate from bundled data (`mobile/data` / `getLotById`) so a **500 m** geofence can fire.
4. While the route runs, confirm:
   - Geofence enter wakes the app (check **Profile → Auto-park diagnostics** after opening the app).
   - **Export Auto-Park Logs** contains `reason=` lines and geofence entries.

## 2. Profile simulator (JS detection only)

With **`__DEV__`** or `EXPO_PUBLIC_SHOW_AUTOPARK_SIMULATOR=true`, **Simulate Auto-Park** runs synthetic GPS samples through the same `detectParking` path as production. It does **not** exercise iOS geofence delivery.

## 3. Diagnostics and logs

- **Auto-park diagnostics** shows the last saved decision: branch, signal snapshot, and top candidate summary.
- **Export Auto-Park Logs** includes the full `BackgroundLogger` file (`autopark_debug.log`).

Together, GPX + export proves the stack end-to-end; diagnostics + simulator prove the scoring logic without leaving home.
