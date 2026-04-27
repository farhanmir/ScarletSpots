# Mobile Store Hardening Notes

## Native iOS permission rationale

- Location:
  lot resolution, map centering, and parking-session flows
- Motion:
  stronger AutoPark / AutoEnd confidence
- Notifications:
  session and friend updates, plus silent refresh paths
- Background modes:
  low-power sensing and state synchronization
- Audio route / Bluetooth-adjacent signals:
  supporting confidence signals where available

## Review-note themes

- the app records lot/session state, not a raw location timeline as the main product primitive
- bundled static lot data reduces backend collection needs
- permissions degrade gracefully and manual usage remains available
- occupancy confidence is surfaced honestly when signal is weak

## Manual checks before submission

- prompts match actual runtime behavior
- denial flows still allow manual park/end/search
- notification taps route safely
- privacy, terms, and support URLs are live

## Remaining hardening work

- keep the privacy manifest aligned with real native APIs in use
- re-check review notes whenever sensing behavior changes
- verify App Store screenshots and support details on every release candidate

Last reviewed: 2026-04-26
