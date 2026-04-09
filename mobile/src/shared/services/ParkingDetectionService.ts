/**
 * ParkingDetectionService — Multi-signal parking detection pipeline
 *
 * Inspired by Apple Maps / Google Maps approach:
 *   1. Speed buffer: rolling window of last readings
 *   2. Transition detection: speed drops from driving (>5 m/s) to stopped (<1 m/s)
 *   3. Accelerometer stillness: variance of accelerometer readings drops below threshold
 *   4. Heading change: sharp direction change (>45 °) signals a turn into a lot
 *   5. Geofence check: is the stopped location inside a known lot polygon?
 *   6. Confidence score: weighted combination of all signals (0.0–1.0)
 */

import { isPointInPolygon } from "../utils/geofence";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ParkingCandidate {
  lotId: string;
  lotName: string;
  latitude: number;
  longitude: number;
  confidence: number; // 0.0 – 1.0
  signals: SignalBreakdown;
  timestamp: string;
  /**
   * True only when the device is currently inside the lot polygon (insideLot === 1).
   * Nearby-only candidates must never be auto-confirmed without explicit user input.
   */
  autoConfirmable: boolean;
}

export interface SignalBreakdown {
  speedTransition: number; // 0–1  Did speed drop from driving to stopped?
  stillness: number; // 0–1  Is accelerometer showing stillness?
  headingChange: number; // 0–1  Did we make a sharp turn (into a lot entrance)?
  insideLot: number; // 0–1  Is the point inside a known lot polygon?
  pedometerSignal: number; // 0–1  Did we detect walking steps?
  gpsAccuracy: number; // 0–1  How good is the GPS fix?
  /** Optional: native / persisted activity + BT hints (0–1). */
  activitySignal?: number;
}

/** Confidence → approximate GPS radius in meters for the candidate pin overlay. */
export function confidenceToRadius(
  confidence: number,
  horizontalAccuracy: number | null,
): number {
  const base =
    horizontalAccuracy && horizontalAccuracy > 0 ? horizontalAccuracy : 30;
  // High confidence → tighter radius; low confidence → wider uncertainty circle
  return Math.round(base + (1 - confidence) * 80);
}

/**
 * Lot geometry for detection — matches bundled `RutgersLot` polygons (multi-ring + holes).
 */
export interface LotForDetection {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Outer rings (MultiPolygon parts), each ring [lat, lng][] */
  coordinates?: [number, number][][];
  /** Hole rings per outer ring index (same structure as map Polygons). */
  holes?: [number, number][][][];
}

export interface AccelReading {
  x: number;
  y: number;
  z: number;
}

export interface DetectParkingOptions {
  /** True if GPS speed buffer missed driving but we have a recent driving timestamp (AsyncStorage). */
  recentDrivingPersisted?: boolean;
  /** 0–1 boost from `loadActivityBoost()` (walking / future native signals). */
  activityBoost?: number;
  /**
   * When true, suppresses the `recentDrivingPersisted` shortcut — used when a
   * transit stop-go oscillation has been detected in the speed buffer so that
   * bus / train passengers cannot silently trigger parking detection.
   */
  transitPatternDetected?: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────────

/** m/s (~11 mph) — considered driving; shared with background task sensor gating. */
export const DRIVING_SPEED_THRESHOLD = 5;
const STOPPED_SPEED_THRESHOLD = 2.5; // m/s (~5.5 mph) — encompasses walking speed
const STILLNESS_VARIANCE_THRESHOLD = 0.2; // g² — accelerometer variance threshold
const GPS_ACCURACY_GOOD = 10; // meters
const GPS_ACCURACY_ACCEPTABLE = 30; // meters

// Heading change threshold — turns >45° within a short window signal lot entry
const HEADING_CHANGE_THRESHOLD_DEG = 45;

/** Nearby lots: tighter radius to reduce false positives (meters). */
const NEARBY_MAX_DISTANCE_METERS = 100;

// Weight each signal when computing final confidence (sums to 1.0)
const WEIGHTS = {
  speedTransition: 0.25,
  stillness: 0.05,
  headingChange: 0.10,
  insideLot: 0.35,
  pedometerSignal: 0.05,
  gpsAccuracy: 0.05,
  activitySignal: 0.15,
} as const;

export interface TimeAwareReading<T> {
  value: T;
  timestamp: number;
}

// ── Pedometer Buffer ───────────────────────────────────────────────────────────

const PEDOMETER_BUFFER_SIZE = 5;
let stepCountBuffer: number[] = [];

export function pushSteps(steps: number): void {
  stepCountBuffer.push(steps);
  if (stepCountBuffer.length > PEDOMETER_BUFFER_SIZE) {
    stepCountBuffer.shift();
  }
}

export function clearPedometerBuffer(): void {
  stepCountBuffer = [];
}

/**
 * Pedometer score: walking after stop. Unknown samples do not inflate confidence.
 */
export function computePedometerScore(): number {
  if (stepCountBuffer.length < 2) return 0;

  const last = stepCountBuffer.at(-1) ?? 0;
  const prev = stepCountBuffer.at(-2) ?? 0;
  if (last > prev) return 1;
  return last > 0 ? 0.4 : 0;
}

// ── Speed Buffer ───────────────────────────────────────────────────────────────

const SPEED_WINDOW_MS = 5 * 60 * 1000; // 5 minutes history for background survival
let speedBuffer: TimeAwareReading<number>[] = [];

export function pushSpeed(speed: number | null, timestamp: number = Date.now()): void {
  if (speed === null || speed === undefined) return;
  speedBuffer.push({ value: speed, timestamp });
  while (speedBuffer.length > 0 && timestamp - speedBuffer[0].timestamp > SPEED_WINDOW_MS) {
    speedBuffer.shift();
  }
}

export function getSpeedBuffer(): TimeAwareReading<number>[] {
  return [...speedBuffer];
}

export function clearSpeedBuffer(): void {
  speedBuffer = [];
}

/**
 * Detects a transit (bus / train) stop-go oscillation pattern in the speed buffer:
 * at least two high-speed segments separated by a sub-stopped segment.
 * Pattern: […high… low …high…] — a typical bus stop signature.
 *
 * Returns true when the buffer contains enough evidence that the device is riding
 * transit rather than driving a personal vehicle to a parking lot.
 */
export function isTransitStopGoPattern(): boolean {
  if (speedBuffer.length < 4) return false;

  let highSegments = 0;
  let inHigh = false;

  for (const s of speedBuffer) {
    if (s.value > DRIVING_SPEED_THRESHOLD) {
      if (!inHigh) {
        highSegments += 1;
        inHigh = true;
      }
    } else if (s.value < STOPPED_SPEED_THRESHOLD) {
      inHigh = false;
    }
  }

  // Four distinct high-speed segments with gaps = likely bus/train route.
  // Two segments (the previous threshold) is too common in stop-and-go traffic.
  return highSegments >= 4;
}

/** True if recent speed readings indicate driving (e.g. leaving in a car). Used to distinguish walk-out vs drive-out. */
export function wasRecentlyDriving(withinMs = 2 * 60 * 1000): boolean {
  const now = Date.now();
  const recent = speedBuffer.filter((s) => s.value >= 0 && now - s.timestamp <= withinMs);
  if (recent.length === 0) return false;
  return Math.max(...recent.map((s) => s.value)) >= DRIVING_SPEED_THRESHOLD;
}

// ── Accelerometer Buffer ───────────────────────────────────────────────────────

const ACCEL_BUFFER_SIZE = 20;
let accelBuffer: AccelReading[] = [];

export function pushAccel(reading: AccelReading): void {
  accelBuffer.push(reading);
  if (accelBuffer.length > ACCEL_BUFFER_SIZE) {
    accelBuffer.shift();
  }
}

export function clearAccelBuffer(): void {
  accelBuffer = [];
}

// ── Heading Buffer ─────────────────────────────────────────────────────────────

const HEADING_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
let headingBuffer: TimeAwareReading<number>[] = [];

/**
 * Push a compass heading (0–360°) into the rolling time window.
 * Pass null/undefined when heading is unavailable (e.g. indoors).
 */
export function pushHeading(heading: number | null, timestamp: number = Date.now()): void {
  if (heading === null || heading === undefined || heading < 0) return;
  headingBuffer.push({ value: heading, timestamp });
  while (headingBuffer.length > 0 && timestamp - headingBuffer[0].timestamp > HEADING_WINDOW_MS) {
    headingBuffer.shift();
  }
}

export function clearHeadingBuffer(): void {
  headingBuffer = [];
}

// ── Persistence API ──────────────────────────────────────────────────────────

export interface DetectionBuffersSnapshot {
  speed: TimeAwareReading<number>[];
  heading: TimeAwareReading<number>[];
}

export function getDetectionBuffersSnapshot(): DetectionBuffersSnapshot {
  return { speed: [...speedBuffer], heading: [...headingBuffer] };
}

export function restoreDetectionBuffersSnapshot(snapshot: DetectionBuffersSnapshot): void {
  const now = Date.now();
  if (snapshot.speed) {
    speedBuffer = snapshot.speed.filter((s) => now - s.timestamp <= SPEED_WINDOW_MS);
  }
  if (snapshot.heading) {
    headingBuffer = snapshot.heading.filter((s) => now - s.timestamp <= HEADING_WINDOW_MS);
  }
}

// ── Signal Computations ────────────────────────────────────────────────────────

/**
 * Speed transition score: driving (>5 m/s) then stopped (<1 m/s).
 * No "weak" 0.3 branch — avoids bus / pedestrian-only stops unless corroborated elsewhere.
 *
 * When `transitPatternDetected` is true, score is always 0 (hard veto) so
 * bus/train stop-go patterns cannot combine with walking signals for a false park.
 */
export function computeSpeedTransitionScore(
  recentDrivingPersisted?: boolean,
  transitPatternDetected?: boolean,
): number {
  if (transitPatternDetected) return 0;

  if (speedBuffer.length < 2) return 0;

  const inBufferDriving = speedBuffer
    .slice(0, -2)
    .some((s) => s.value > DRIVING_SPEED_THRESHOLD);

  const recentDriving =
    inBufferDriving || (!!recentDrivingPersisted && !transitPatternDetected);

  const lastTwo = speedBuffer.slice(-2);
  const nowStopped = lastTwo.every((s) => s.value < STOPPED_SPEED_THRESHOLD);

  if (recentDriving && nowStopped) return 1;
  return 0;
}

/**
 * Accelerometer stillness score: low variance = device is still (parked/on table).
 * Returns 0 when insufficient samples — avoids rewarding confidence without evidence.
 */
export function computeStillnessScore(): number {
  if (accelBuffer.length < 5) return 0;

  // Compute variance of magnitude
  const magnitudes = accelBuffer.map((r) => Math.hypot(r.x, r.y, r.z));
  const mean = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
  const variance =
    magnitudes.reduce((sum, m) => sum + (m - mean) ** 2, 0) / magnitudes.length;

  if (variance < STILLNESS_VARIANCE_THRESHOLD * 0.5) return 1; // Very still
  if (variance < STILLNESS_VARIANCE_THRESHOLD) return 0.7; // Mostly still
  if (variance < STILLNESS_VARIANCE_THRESHOLD * 2) return 0.3; // Somewhat active
  return 0; // Active / moving
}

/**
 * Heading-change score: a sharp direction change (>45 °) during the recent
 * deceleration window strongly suggests turning into a parking lot.
 * Returns 0 when insufficient samples — avoids rewarding confidence without evidence.
 */
export function computeHeadingChangeScore(): number {
  if (headingBuffer.length < 3) return 0;

  let maxDelta = 0;
  for (let i = 1; i < headingBuffer.length; i++) {
    let delta = Math.abs(headingBuffer[i].value - headingBuffer[i - 1].value);
    if (delta > 180) delta = 360 - delta;
    if (delta > maxDelta) maxDelta = delta;
  }

  if (maxDelta >= HEADING_CHANGE_THRESHOLD_DEG * 1.5) return 1;
  if (maxDelta >= HEADING_CHANGE_THRESHOLD_DEG) return 0.75;
  if (maxDelta >= HEADING_CHANGE_THRESHOLD_DEG * 0.5) return 0.5;
  return 0.2;
}

/**
 * GPS accuracy score.
 */
export function computeGpsAccuracyScore(
  horizontalAccuracy: number | null,
): number {
  if (!horizontalAccuracy || horizontalAccuracy <= 0) return 0.35;
  if (horizontalAccuracy <= GPS_ACCURACY_GOOD) return 1;
  if (horizontalAccuracy <= GPS_ACCURACY_ACCEPTABLE) return 0.7;
  if (horizontalAccuracy <= 50) return 0.4;
  return 0.1;
}

/**
 * Point in one lot: outer rings minus holes (ray-cast; same as map polygons).
 */
export function isPointInLot(
  latitude: number,
  longitude: number,
  lot: LotForDetection,
): boolean {
  const outers = lot.coordinates;
  if (!outers?.length) return false;

  const pt: [number, number] = [latitude, longitude];

  for (let i = 0; i < outers.length; i++) {
    const ring = outers[i];
    if (ring.length < 3) continue;
    if (!isPointInPolygon(pt, ring)) continue;

    const holeRings = lot.holes?.[i];
    if (holeRings?.length) {
      let inHole = false;
      for (const hole of holeRings) {
        if (hole.length >= 3 && isPointInPolygon(pt, hole)) {
          inHole = true;
          break;
        }
      }
      if (inHole) continue;
    }
    return true;
  }
  return false;
}

/**
 * Check if a coordinate is inside any lot. Returns the best-match lot or null.
 */
export function findContainingLot(
  latitude: number,
  longitude: number,
  lots: LotForDetection[],
): LotForDetection | null {
  for (const lot of lots) {
    if (isPointInLot(latitude, longitude, lot)) {
      return lot;
    }
  }
  return null;
}

/**
 * Find the nearest lots by distance (if not inside any polygon).
 */
export function findNearestLots(
  latitude: number,
  longitude: number,
  lots: LotForDetection[],
  maxResults = 3,
  maxDistanceMeters = NEARBY_MAX_DISTANCE_METERS,
): { lot: LotForDetection; distance: number }[] {
  const results = lots
    .map((lot) => ({
      lot,
      distance: haversineDistance(
        latitude,
        longitude,
        lot.latitude,
        lot.longitude,
      ),
    }))
    .filter((r) => r.distance <= maxDistanceMeters)
    .sort((a, b) => a.distance - b.distance);

  return results.slice(0, maxResults);
}

function confidenceFromSignals(
  signals: SignalBreakdown,
  activityBoost: number,
): number {
  const activity = Math.min(1, Math.max(0, activityBoost));
  const merged: SignalBreakdown = {
    ...signals,
    activitySignal: activity,
  };

  let c =
    merged.speedTransition * WEIGHTS.speedTransition +
    merged.stillness * WEIGHTS.stillness +
    merged.headingChange * WEIGHTS.headingChange +
    merged.insideLot * WEIGHTS.insideLot +
    merged.pedometerSignal * WEIGHTS.pedometerSignal +
    merged.gpsAccuracy * WEIGHTS.gpsAccuracy +
    activity * WEIGHTS.activitySignal;

  return Math.min(1, Math.max(0, c));
}

// ── Main Detection Function ────────────────────────────────────────────────────

/**
 * Given the current sensor state and lot data, compute parking candidates
 * ranked by confidence.
 */
export function detectParking(
  latitude: number,
  longitude: number,
  horizontalAccuracy: number | null,
  lots: LotForDetection[],
  options?: DetectParkingOptions,
): ParkingCandidate[] {
  const recentDrivingPersisted = Boolean(options?.recentDrivingPersisted);
  const activityBoost = options?.activityBoost ?? 0;
  const transitPatternDetected =
    options?.transitPatternDetected ?? isTransitStopGoPattern();

  const speedScore = computeSpeedTransitionScore(
    recentDrivingPersisted,
    transitPatternDetected,
  );
  const stillnessScore = computeStillnessScore();
  const gpsScore = computeGpsAccuracyScore(horizontalAccuracy);
  const headingScore = computeHeadingChangeScore();

  if (speedScore === 0) return [];

  const pedometerScore = computePedometerScore();

  const candidates: ParkingCandidate[] = [];

  const containingLot = findContainingLot(latitude, longitude, lots);
  if (containingLot) {
    const signals: SignalBreakdown = {
      speedTransition: speedScore,
      stillness: stillnessScore,
      headingChange: headingScore,
      insideLot: 1,
      pedometerSignal: pedometerScore,
      gpsAccuracy: gpsScore,
      activitySignal: activityBoost,
    };
    const confidence = confidenceFromSignals(signals, activityBoost);

    candidates.push({
      lotId: containingLot.id,
      lotName: containingLot.name,
      latitude,
      longitude,
      confidence,
      signals,
      timestamp: new Date().toISOString(),
      autoConfirmable: true,
    });
  }

  // Nearby-only candidates require a full speed transition (no weak / ambiguous path).
  if (speedScore >= 1) {
    const nearby = findNearestLots(
      latitude,
      longitude,
      lots,
      3,
      NEARBY_MAX_DISTANCE_METERS,
    );
    for (const { lot, distance } of nearby) {
      if (lot.id === containingLot?.id) continue;

      const proximityScore = Math.max(
        0,
        1 - distance / NEARBY_MAX_DISTANCE_METERS,
      );

      const signals: SignalBreakdown = {
        speedTransition: speedScore,
        stillness: stillnessScore,
        headingChange: headingScore,
        insideLot: proximityScore * 0.45,
        pedometerSignal: pedometerScore,
        gpsAccuracy: gpsScore,
        activitySignal: activityBoost,
      };
      const confidence = confidenceFromSignals(signals, activityBoost);

      candidates.push({
        lotId: lot.id,
        lotName: lot.name,
        latitude: lot.latitude,
        longitude: lot.longitude,
        confidence,
        signals,
        timestamp: new Date().toISOString(),
        // Nearby-only: never silently confirmed — must go through confirmation UI.
        autoConfirmable: false,
      });
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence);

  return candidates.slice(0, 3);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Reset rolling buffers (e.g. geofence exit or session teardown). */
export function clearAllDetectionBuffers(): void {
  clearPedometerBuffer();
  clearSpeedBuffer();
  clearAccelBuffer();
  clearHeadingBuffer();
}
