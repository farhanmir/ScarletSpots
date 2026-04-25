# Mobile Store Hardening Notes

## Permission Rationale (for review notes and in-app copy)

- `NSLocationAlwaysAndWhenInUseUsageDescription`
  - Needed for passive parking transition detection and parked-lot resolution.
- `NSMotionUsageDescription`
  - Used to detect driving-to-walking transitions and reduce false park events.
- `NSBluetoothAlwaysUsageDescription`
  - Used as an auxiliary arrival/departure signal when connected to vehicle audio routes.
- `UIBackgroundModes` (`location`, `fetch`, `remote-notification`)
  - Supports low-power sensing and closed-app state synchronization after occupancy/session changes.

## Privacy Manifest

- Added: `mobile/modules/parking-magic/ios/PrivacyInfo.xcprivacy`
- Purpose: declare native module data collection expectations for App Store privacy review.

## Push + Deep Link Verification

- Existing deep-link scheme: `scarletspots://`
- Existing push token lifecycle:
  - mobile registration and sync
  - backend upsert/deactivate endpoints
  - park flow fan-out to friend notifications
- Manual checks before release:
  - verify push token registration on login/logout
  - verify notification tap routes to expected screen
  - verify auto-start notifications do not open unsafe routes while locked

## Crash Triage (2026-04-25 .ips)

Crash file: `ScarletSpots-2026-04-25-153013.ips`

Initial read indicates:
- faulting thread: JS runtime thread
- exception: `EXC_BAD_ACCESS / SIGSEGV`
- stack points into Hermes string handling and React runtime scheduling

Recommended minimal follow-up loop:
1. Reproduce with same build/runtime flags.
2. Capture breadcrumbs immediately before large string operations or JSON parsing in JS paths.
3. Validate no oversized or malformed strings crossing native/JS boundaries.
4. Confirm Hermes and RN versions in lockfile match tested Expo SDK matrix.
