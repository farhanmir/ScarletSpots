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
}

export interface SignalBreakdown {
  speedTransition: number; // 0–1  Did speed drop from driving to stopped?
  stillness: number; // 0–1  Is accelerometer showing stillness?
  headingChange: number; // 0–1  Did we make a sharp turn (into a lot entrance)?
  insideLot: number; // 0–1  Is the point inside a known lot polygon?
  pedometerSignal: number; // 0–1  Did we detect walking steps?
  gpsAccuracy: number; // 0–1  How good is the GPS fix?
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

export interface LotForDetection {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  coordinates?: number[][];
}

export interface AccelReading {
  x: number;
  y: number;
  z: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DRIVING_SPEED_THRESHOLD = 5; // m/s (~11 mph) — considered driving
const STOPPED_SPEED_THRESHOLD = 1; // m/s (~2 mph) — considered stopped/walking
const STILLNESS_VARIANCE_THRESHOLD = 0.2; // g² — accelerometer variance threshold
const GPS_ACCURACY_GOOD = 10; // meters
const GPS_ACCURACY_ACCEPTABLE = 30; // meters

// Heading change threshold — turns >45° within a short window signal lot entry
const HEADING_CHANGE_THRESHOLD_DEG = 45;

// Weight each signal when computing final confidence
const WEIGHTS = {
  speedTransition: 0.25,
  stillness: 0.15,
  headingChange: 0.1,
  insideLot: 0.2,
  pedometerSignal: 0.25,
  gpsAccuracy: 0.05,
} as const;

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
 * Pedometer score: did we detect steps (walking) after the car stopped?
 */
export function computePedometerScore(): number {
  if (stepCountBuffer.length < 2) return 0.5; // Neutral

  // If steps increased recently, it's a strong signal they are walking (parked)
  const isWalking = stepCountBuffer.some((s) => s > 0);
  return isWalking ? 1.0 : 0.0;
}

// ── Speed Buffer ───────────────────────────────────────────────────────────────

const SPEED_BUFFER_SIZE = 10;
let speedBuffer: number[] = [];

export function pushSpeed(speed: number | null): void {
  if (speed === null || speed === undefined) return;
  speedBuffer.push(speed);
  if (speedBuffer.length > SPEED_BUFFER_SIZE) {
    speedBuffer.shift();
  }
}

export function getSpeedBuffer(): number[] {
  return [...speedBuffer];
}

export function clearSpeedBuffer(): void {
  speedBuffer = [];
}

/** True if recent speed readings indicate driving (e.g. leaving in a car). Used to distinguish walk-out vs drive-out. */
export function wasRecentlyDriving(): boolean {
  const valid = speedBuffer.filter((s) => s != null && s >= 0);
  if (valid.length === 0) return false;
  return Math.max(...valid) >= DRIVING_SPEED_THRESHOLD;
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

const HEADING_BUFFER_SIZE = 8;
let headingBuffer: number[] = [];

/**
 * Push a compass heading (0–360°) into the rolling buffer.
 * Pass null/undefined when heading is unavailable (e.g. indoors).
 */
export function pushHeading(heading: number | null): void {
  if (heading === null || heading === undefined || heading < 0) return;
  headingBuffer.push(heading);
  if (headingBuffer.length > HEADING_BUFFER_SIZE) {
    headingBuffer.shift();
  }
}

export function clearHeadingBuffer(): void {
  headingBuffer = [];
}

// ── Signal Computations ────────────────────────────────────────────────────────

/**
 * Speed transition score: did we recently go from driving (>5 m/s) to stopped (<1 m/s)?
 */
export function computeSpeedTransitionScore(): number {
  if (speedBuffer.length < 3) return 0;

  // Check if any recent speed was "driving"
  const recentDriving = speedBuffer
    .slice(0, -2)
    .some((s) => s > DRIVING_SPEED_THRESHOLD);
  // Check if last 2 readings are "stopped"
  const lastTwo = speedBuffer.slice(-2);
  const nowStopped = lastTwo.every((s) => s < STOPPED_SPEED_THRESHOLD);

  if (recentDriving && nowStopped) return 1;
  if (nowStopped && !recentDriving) return 0.3; // Stopped but wasn't clearly driving before
  return 0;
}

/**
 * Accelerometer stillness score: low variance = device is still (parked/on table).
 */
export function computeStillnessScore(): number {
  if (accelBuffer.length < 5) return 0.5; // Unknown, neutral

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
 *
 * Algorithm:
 *   - Compute the maximum angular difference between consecutive heading readings.
 *   - A large cumulative turn during a speed-drop window scores high.
 */
export function computeHeadingChangeScore(): number {
  if (headingBuffer.length < 3) return 0.3; // Not enough data → neutral

  let maxDelta = 0;
  for (let i = 1; i < headingBuffer.length; i++) {
    // Handle wrap-around (e.g. 355° → 5°)
    let delta = Math.abs(headingBuffer[i] - headingBuffer[i - 1]);
    if (delta > 180) delta = 360 - delta;
    if (delta > maxDelta) maxDelta = delta;
  }

  if (maxDelta >= HEADING_CHANGE_THRESHOLD_DEG * 1.5) return 1; // Very sharp turn
  if (maxDelta >= HEADING_CHANGE_THRESHOLD_DEG) return 0.75; // Clear turn
  if (maxDelta >= HEADING_CHANGE_THRESHOLD_DEG * 0.5) return 0.5; // Mild curve
  return 0.2; // Straight road — unlikely to be entering a lot
}

/**
 * GPS accuracy score.
 */
export function computeGpsAccuracyScore(
  horizontalAccuracy: number | null,
): number {
  if (!horizontalAccuracy || horizontalAccuracy <= 0) return 0.5;
  if (horizontalAccuracy <= GPS_ACCURACY_GOOD) return 1;
  if (horizontalAccuracy <= GPS_ACCURACY_ACCEPTABLE) return 0.7;
  if (horizontalAccuracy <= 50) return 0.4;
  return 0.1; // Very poor
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
    if (lot.coordinates && lot.coordinates.length >= 3) {
      if (isPointInPolygon([latitude, longitude], lot.coordinates)) {
        return lot;
      }
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
  maxDistanceMeters = 200,
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
): ParkingCandidate[] {
  const speedScore = computeSpeedTransitionScore();
  const stillnessScore = computeStillnessScore();
  const gpsScore = computeGpsAccuracyScore(horizontalAccuracy);
  const headingScore = computeHeadingChangeScore();

  // If speed transition score is 0, no transition detected — skip
  if (speedScore === 0) return [];

  const candidates: ParkingCandidate[] = [];

  // Check if inside a lot polygon
  const containingLot = findContainingLot(latitude, longitude, lots);
  if (containingLot) {
    const signals: SignalBreakdown = {
      speedTransition: speedScore,
      stillness: stillnessScore,
      headingChange: headingScore,
      insideLot: 1,
      pedometerSignal: computePedometerScore(),
      gpsAccuracy: gpsScore,
    };
    const confidence =
      signals.speedTransition * WEIGHTS.speedTransition +
      signals.stillness * WEIGHTS.stillness +
      signals.headingChange * WEIGHTS.headingChange +
      signals.insideLot * WEIGHTS.insideLot +
      signals.pedometerSignal * WEIGHTS.pedometerSignal +
      signals.gpsAccuracy * WEIGHTS.gpsAccuracy;

    candidates.push({
      lotId: containingLot.id,
      lotName: containingLot.name,
      latitude,
      longitude,
      confidence: Math.min(1, Math.max(0, confidence)),
      signals,
      timestamp: new Date().toISOString(),
    });
  }

  // Also find nearby lots as alternatives
  const nearby = findNearestLots(latitude, longitude, lots);
  for (const { lot, distance } of nearby) {
    if (lot.id === containingLot?.id) continue; // Already added

    // Distance penalty: further away = lower confidence for "insideLot" signal
    const proximityScore = Math.max(0, 1 - distance / 200);

    const signals: SignalBreakdown = {
      speedTransition: speedScore,
      stillness: stillnessScore,
      headingChange: headingScore,
      insideLot: proximityScore * 0.5, // Nearby but not inside
      pedometerSignal: computePedometerScore(),
      gpsAccuracy: gpsScore,
    };
    const confidence =
      signals.speedTransition * WEIGHTS.speedTransition +
      signals.stillness * WEIGHTS.stillness +
      signals.headingChange * WEIGHTS.headingChange +
      signals.insideLot * WEIGHTS.insideLot +
      signals.pedometerSignal * WEIGHTS.pedometerSignal +
      signals.gpsAccuracy * WEIGHTS.gpsAccuracy;

    candidates.push({
      lotId: lot.id,
      lotName: lot.name,
      latitude: lot.latitude,
      longitude: lot.longitude,
      confidence: Math.min(1, Math.max(0, confidence)),
      signals,
      timestamp: new Date().toISOString(),
    });
  }

  // Sort by confidence descending
  candidates.sort((a, b) => b.confidence - a.confidence);

  return candidates.slice(0, 3); // Top 3
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth radius in meters
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
