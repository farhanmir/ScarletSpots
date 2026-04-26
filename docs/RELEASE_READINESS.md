# Release Readiness

This checklist is for the current native iOS app, backend, and website stack.

## Native iOS ship gate

- verify sign-in, sign-out, and delete/export flows
- verify manual park + end session
- verify auto-park signal handling on real devices
- verify websocket occupancy updates and push token sync
- verify permissions copy and fallback UX when permissions are denied
- verify light/dark theme readability on Profile and lot details surfaces

## App Store package

- screenshots from the native iOS app
- review notes describing background sensing and location usage
- privacy/terms/support links pointing to live website pages
- TestFlight beta pass completed

## Backend gate

- migrations apply cleanly
- core tests pass
- websocket and push paths behave in staging
- load test run documented

## Website gate

- landing page builds cleanly
- privacy / terms / support pages are live
- metadata and canonical URLs are correct

## Do before public launch

- capture staging/prod backend capacity notes
- record rollback and hotfix owner
- freeze a release commit/tag

Last reviewed: 2026-04-26
