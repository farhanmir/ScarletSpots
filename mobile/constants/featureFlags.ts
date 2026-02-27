/** Minimum confidence (0–1) before we surface a parking candidate to the user. */
export const PARKING_CONFIDENCE_THRESHOLD = (() => {
  const envVal = process.env.EXPO_PUBLIC_PARKING_CONFIDENCE_THRESHOLD;
  const parsed = Number.parseFloat(envVal ?? '0.8');
  if (Number.isNaN(parsed)) return 0.8;
  return Math.min(Math.max(parsed, 0.5), 1);
})();

/**
 * Whether the heading-change signal is included in the detection pipeline.
 * Disable on devices where compass is unreliable (set env var to "false").
 */
export const HEADING_SIGNAL_ENABLED =
  process.env.EXPO_PUBLIC_HEADING_SIGNAL_ENABLED !== 'false';

/**
 * Maximum number of parking candidates shown in the confirmation sheet
 * and as CandidatePins on the map.
 */
export const MAX_PARKING_CANDIDATES = 3;

/**
 * Whether the offline action queue is active.
 * Can be disabled for debugging (set env var to "false").
 */
export const OFFLINE_QUEUE_ENABLED =
  process.env.EXPO_PUBLIC_OFFLINE_QUEUE_ENABLED !== 'false';

/**
 * How long (ms) to hold lot data in the offline cache before it's considered stale.
 * Defaults to 1 hour.
 */
export const LOT_CACHE_TTL_MS = (() => {
  const envVal = process.env.EXPO_PUBLIC_LOT_CACHE_TTL_MS;
  const parsed = Number.parseInt(envVal ?? '3600000', 10);
  if (Number.isNaN(parsed)) return 3_600_000;
  return parsed;
})();
