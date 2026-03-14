/** Minimum confidence (0–1) before we surface a parking candidate to the user. */
export const PARKING_CONFIDENCE_THRESHOLD = (() => {
  const envVal = process.env.EXPO_PUBLIC_PARKING_CONFIDENCE_THRESHOLD;
  const parsed = Number.parseFloat(envVal ?? "0.8");
  if (Number.isNaN(parsed)) return 0.8;
  return Math.min(Math.max(parsed, 0.5), 1);
})();

/**
 * Whether the heading-change signal is included in the detection pipeline.
 * Disable on devices where compass is unreliable (set env var to "false").
 */
export const HEADING_SIGNAL_ENABLED =
  process.env.EXPO_PUBLIC_HEADING_SIGNAL_ENABLED !== "false";

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
  process.env.EXPO_PUBLIC_OFFLINE_QUEUE_ENABLED !== "false";

/**
 * When true, show ALL Rutgers campuses on the map (Newark, Camden, Piscataway).
 * Default false — New Brunswick only.
 *
 * Set EXPO_PUBLIC_ENABLE_ALL_CAMPUSES="true" to expand coverage.
 */
export const ENABLE_ALL_CAMPUSES =
  process.env.EXPO_PUBLIC_ENABLE_ALL_CAMPUSES === "true";
