# Agent Resources Coverage Audit

This audit maps `agent-resources/` guidance to the current ScarletSpots repository.

Source of truth order:
1. `.cursor/rules/scarletspots.mdc`
2. Project docs (`README.md`, `ROADMAP.md`, architecture docs)
3. `agent-resources/README.md`
4. `agent-resources/claude-code-apple-skills/*` (reference playbooks)

## Status Legend

- `implemented` - present and aligned with local rules.
- `needs work` - in-scope for v1 and should be implemented now.
- `manual release task` - requires App Store Connect, legal, domain, or external credentials.
- `v2/deferred` - valid feature, intentionally not v1.
- `not applicable` - does not fit this app or stack.

## Category Matrix

| Category | Status | Notes |
|---|---|---|
| Product workflow (`skills/product`) | implemented | Core architecture and phased roadmap already exist in repo docs. |
| iOS architecture/review (`skills/ios`) | implemented | Native Swift module and constraints match project direction. |
| Testing (`skills/testing`) | needs work | Backend tests are present; mobile tests and CI coverage needed improvement. |
| Performance (`skills/performance`) | needs work | Remaining load/scale testing tracked in roadmap Phase 5. |
| Release review (`skills/release-review`) | needs work | Privacy manifest, release docs, legal pages, CI gates required. |
| App Store (`skills/app-store`) | needs work | Review notes/screenshots/process docs still incomplete. |
| Security (`skills/security`) | needs work | Add account data portability/deletion endpoints and verification tests. |
| Legal (`skills/legal`) | needs work | Privacy + Terms pages were missing from website. |
| Generators: offline queue/push/logging/background | implemented | Native `parking-magic` and backend push infrastructure already in place. |
| Generators: account deletion/data export | needs work | Implemented in this sweep (backend endpoints + docs). |
| Generators: CI/CD setup | needs work | CI existed but was manual-only and partially non-blocking. |
| Generators: force update/referrals/paywalls/subscriptions/offers | v2/deferred | Out of scope for current v1 commuter utility product. |
| Generators: widgets/live activities extras | v2/deferred | Valuable follow-up; roadmap already tracks related iOS surfaces. |
| Generators: app clip/custom product pages/pre-orders | manual release task | Requires product/marketing decision and App Store Connect setup. |
| macOS/watchOS/visionOS skills | not applicable | Current product target is iOS/Android mobile + website + backend. |
| Apple Intelligence/Core ML advanced skills | v2/deferred | Not required for current occupancy/session core flow. |
| Monetization/growth suites | v2/deferred | Deliberately excluded from current launch scope. |

## Sweep Outcomes

This implementation pass focuses on in-scope `needs work` rows and converts them into concrete repo changes:

- release-readiness documentation and checklists
- website legal/SEO baseline pages
- mobile privacy manifest and permission rationale doc
- backend account export/deletion endpoints and tests
- CI trigger + quality gate hardening
- load-test scaffold for Phase 5 readiness

## Verification Snapshot

- Website build: `npm run build` in `website/` - passed.
- Backend targeted tests: `pytest tests/test_users_account_data.py tests/test_frontend_api_contract.py -q` - passed.
- Mobile tests: `npm run test` in `mobile/` - one existing failing test in `ParkingDetectionService.test.ts` (`detectParking` inside-polygon candidate assertion). This is not introduced by this sweep and should be triaged in a dedicated detection-test stabilization pass.

## Manual/External Tasks Still Required

- Publish website to production domain (`scarletspots.app`) so legal URLs are live.
- Add final App Store Connect metadata, screenshots, and review notes from `docs/RELEASE_READINESS.md`.
- Run full load tests against a staging/prod-like environment and attach performance evidence.
- Validate iOS signing/provisioning and TestFlight rollout steps with Apple credentials.

## Explicitly Deferred (Documented)

The following remain intentional follow-ups and are not regressions:

- monetization/paywall/subscription lifecycle
- referrals/variable rewards/streak systems
- App Clip and custom product pages
- watchOS/visionOS/macOS product surfaces
- advanced Apple Intelligence user-facing features
