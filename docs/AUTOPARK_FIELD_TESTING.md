# Auto-Park Field Testing

Use this for the current native iOS app on a physical device.

## Preferred validation path

1. Run the app from Xcode.
2. Grant the intended location, motion, and notification permissions.
3. Test real arrival and departure behavior on-device.
4. Capture whether the following stayed correct:
   - session start and end behavior
   - lot resolution
   - diagnostics freshness
   - websocket or push follow-through where applicable

## Simulator limits

The simulator is fine for UI and some location fixtures, but it is not enough for:

- real background sensing
- route or audio-disconnect behavior
- device motion behavior
- realistic wake and relaunch timing

## What to capture

- false positives
- false negatives
- screenshots from diagnostics surfaces
- exact lot, route, and timing details
- whether the event happened in foreground, background, or relaunch

## Success criteria

- park detection feels explainable
- manual correction is obvious
- no permission configuration traps the user
- diagnostics tell a believable story about why a start or end did or did not happen

Last reviewed: 2026-04-26
