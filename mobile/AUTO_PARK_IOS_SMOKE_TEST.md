# Auto-Park iOS Smoke Test

This verifies the native Swift cycle:

1. Disconnect signal triggers auto-start
2. Session is started
3. Reconnect signal ends session
4. Session returns to idle

## Preconditions

- iOS simulator or device running the app build with `ParkingMagic` module.
- User has called `syncUserData(...)` in app flow (native network client configured).
- Backend is reachable.

## Programmatic Smoke Path (native)

Use the bridge function:

- `runAutoParkSmokeTest(latitude, longitude)`

It executes the same native start/end session path and returns:

- `ok`
- `startSuccess`
- `endSuccess`
- `activeAfter`
- `error`

Suggested Rutgers test coordinates:

- `40.5230, -74.4580`

## Optional State Check

Use:

- `getNativeSessionState()`

Expected after a successful smoke run:

- `activeAutoSession: false`
- `isParkingEventInFlight: false`
- `isEndingSession: false`
- `pendingEventSource: null`

## Example (JS/TS)

```ts
import {
  runAutoParkSmokeTest,
  getNativeSessionState,
} from '../modules/parking-magic';

const result = await runAutoParkSmokeTest(40.5230, -74.4580);
console.log('smoke result', result);

const state = await getNativeSessionState();
console.log('native session state', state);
```

## Pass Criteria

- `result.ok === true`
- `result.startSuccess === true`
- `result.endSuccess === true`
- `result.activeAfter === false`
