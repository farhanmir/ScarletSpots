# Auto-Park Field Testing

Use this for the current native iOS app on a physical device.

## Preferred validation path

1. run the native app from Xcode
2. grant the intended location/motion permissions
3. test real arrival/departure behavior on-device
4. confirm:
   - session start/end correctness
   - lot resolution correctness
   - diagnostics updates
   - push / websocket follow-through where applicable

## Simulator limits

The simulator is fine for UI and some location fixtures, but it is not enough for confidence work on:
- route/audio disconnect signals
- real background sensing
- device motion behavior

## What to capture

- false positive examples
- false negative examples
- diagnostics screenshot or log context
- exact lot and route details

## Success criteria

- park detection feels explainable
- manual correction paths are obvious
- no permission configuration traps the user

Last reviewed: 2026-04-26
