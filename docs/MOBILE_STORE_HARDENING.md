# Mobile Store Hardening Notes

## Native iOS permission rationale

- Location:
  used for lot resolution, manual centering, and parking-session flows
- Motion:
  used to improve parking-transition confidence
- Bluetooth / audio-route signals:
  used only as a supporting confidence signal where available
- Background modes:
  support low-power sensing and state synchronization

## Review-note themes

- the app stores lot IDs / parking state, not a raw location timeline as the main product primitive
- bundled static lot data reduces backend collection needs
- permissions should degrade gracefully, not brick manual usage

## Manual checks before submission

- permission prompts match actual behavior
- notification taps route safely
- denial flows still allow manual park/end/search
- legal/support URLs are live

## Remaining hardening work

- keep privacy manifest aligned with actual native data access
- re-check copy any time sensing behavior changes
- repeat review-note pass before each release candidate

Last reviewed: 2026-04-26
