# Release Readiness

This checklist is for the current native iOS app, backend, and website stack.

## Native iOS ship gate

- verify sign-in, sign-out, password reset, delete, and export flows
- verify manual park and end-session paths
- verify AutoPark / AutoEnd behavior on physical devices
- verify websocket occupancy updates and push token sync
- verify permission copy and denied-permission fallback UX
- verify Live Activity / widget session state does not regress core flows

## App Store package

- screenshots come from the current native iOS app
- review notes explain background location, motion, and notification behavior
- privacy and terms links point to live website pages
- TestFlight beta pass is complete
- support email and website URLs are correct

## Backend gate

- migrations apply cleanly
- core tests pass
- websocket and push paths behave in staging
- load-test results are saved and reviewed
- any attestation mode change is documented for the release

## Website gate

- landing page builds cleanly
- the App Store CTA no longer points at the generic placeholder URL
- privacy and terms pages are live
- metadata and canonical URLs are correct

## Do before public launch

- capture backend capacity notes
- record rollback and hotfix ownership
- freeze the release commit or tag

Last reviewed: 2026-04-26
