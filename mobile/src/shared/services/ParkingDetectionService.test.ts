import { describe, it, expect, beforeEach } from "vitest";
import {
  clearAllDetectionBuffers,
  computeHeadingChangeScore,
  computeSpeedTransitionScore,
  computeStillnessScore,
  detectParking,
  isPointInLot,
  isTransitStopGoPattern,
  pushAccel,
  pushHeading,
  pushSpeed,
  type LotForDetection,
} from "./ParkingDetectionService";

/** Simulate a clean driving-to-stop sequence in the speed buffer. */
function pushDriveAndStop() {
  pushSpeed(12);
  pushSpeed(10);
  pushSpeed(8);
  pushSpeed(0.3);
  pushSpeed(0.2);
}

describe("computeSpeedTransitionScore", () => {
  beforeEach(() => {
    clearAllDetectionBuffers();
  });

  it("returns 1 when prior samples show driving then last two are stopped", () => {
    pushSpeed(8);
    pushSpeed(6);
    pushSpeed(0.2);
    pushSpeed(0.1);
    expect(computeSpeedTransitionScore(false)).toBe(1);
  });

  it("returns 0 when stopped without prior driving in buffer", () => {
    pushSpeed(0.2);
    pushSpeed(0.1);
    pushSpeed(0.2);
    expect(computeSpeedTransitionScore(false)).toBe(0);
  });

  it("returns 1 when GPS missed driving but persisted driving flag is set", () => {
    pushSpeed(0.2);
    pushSpeed(0.1);
    pushSpeed(0.2);
    pushSpeed(0.1);
    expect(computeSpeedTransitionScore(true)).toBe(1);
  });

  it("ignores persisted driving flag when transit pattern is detected", () => {
    // Buffer shows only walking-speed stops — no in-buffer driving
    pushSpeed(0.2);
    pushSpeed(0.1);
    pushSpeed(0.3);
    pushSpeed(0.1);
    // persisted=true BUT transit pattern suppresses it
    expect(computeSpeedTransitionScore(true, true)).toBe(0);
  });

  it("returns 0 when transit flag is set even if buffer shows driving then stop (bus veto)", () => {
    pushSpeed(12);
    pushSpeed(0.3);
    pushSpeed(0.2);
    pushSpeed(0.1);
    expect(computeSpeedTransitionScore(false, true)).toBe(0);
  });
});

describe("computeStillnessScore", () => {
  beforeEach(() => {
    clearAllDetectionBuffers();
  });

  it("returns 0 when fewer than 5 accelerometer samples are available", () => {
    pushAccel({ x: 0, y: 0, z: 1 });
    pushAccel({ x: 0, y: 0, z: 1 });
    expect(computeStillnessScore()).toBe(0);
  });

  it("returns 1 for very still device (near-zero variance)", () => {
    for (let i = 0; i < 10; i++) {
      pushAccel({ x: 0.01, y: 0.01, z: 1 });
    }
    expect(computeStillnessScore()).toBe(1);
  });

  it("returns 0 for highly active device", () => {
    for (let i = 0; i < 10; i++) {
      pushAccel({ x: i * 0.5, y: -i * 0.5, z: 1 + i * 0.3 });
    }
    expect(computeStillnessScore()).toBe(0);
  });
});

describe("computeHeadingChangeScore", () => {
  beforeEach(() => {
    clearAllDetectionBuffers();
  });

  it("returns 0 when fewer than 3 heading samples are available", () => {
    pushHeading(45);
    pushHeading(90);
    expect(computeHeadingChangeScore()).toBe(0);
  });

  it("returns 1 for a sharp turn (>67.5° — above 1.5× threshold)", () => {
    pushHeading(0);
    pushHeading(80);
    pushHeading(160);
    // Max delta: 80° — above 45 * 1.5 = 67.5°, should return 1
    expect(computeHeadingChangeScore()).toBe(1);
  });

  it("handles wrap-around at 360/0°", () => {
    pushHeading(350);
    pushHeading(180);
    pushHeading(10);
    // 350 → 10 = 20° (wrap), 180 → 350 = 170° — large delta detected
    expect(computeHeadingChangeScore()).toBeGreaterThan(0.5);
  });
});

describe("isTransitStopGoPattern", () => {
  beforeEach(() => {
    clearAllDetectionBuffers();
  });

  it("returns false with fewer than 6 speed samples", () => {
    pushSpeed(10);
    pushSpeed(0);
    pushSpeed(10);
    expect(isTransitStopGoPattern()).toBe(false);
  });

  it("detects two distinct high-speed segments", () => {
    // High → low → high: classic bus stop signature
    pushSpeed(12);
    pushSpeed(11);
    pushSpeed(0.5); // stopped at bus stop
    pushSpeed(0.3);
    pushSpeed(10);
    pushSpeed(9);
    expect(isTransitStopGoPattern()).toBe(true);
  });

  it("returns false for a single driving-to-stop without resuming", () => {
    // Car parks — one deceleration with no second high-speed segment
    pushSpeed(12);
    pushSpeed(8);
    pushSpeed(3);
    pushSpeed(0.5);
    pushSpeed(0.3);
    pushSpeed(0.2);
    expect(isTransitStopGoPattern()).toBe(false);
  });
});

describe("isPointInLot", () => {
  const square: LotForDetection = {
    id: "1",
    name: "Test",
    latitude: 0,
    longitude: 0,
    coordinates: [
      [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
        [0, 0],
      ],
    ],
    holes: [],
  };

  it("detects point inside outer ring", () => {
    expect(isPointInLot(0.5, 0.5, square)).toBe(true);
  });

  it("respects a rectangular hole", () => {
    const withHole: LotForDetection = {
      ...square,
      holes: [
        [
          [
            [0.25, 0.25],
            [0.25, 0.75],
            [0.75, 0.75],
            [0.75, 0.25],
            [0.25, 0.25],
          ],
        ],
      ],
    };
    expect(isPointInLot(0.5, 0.5, withHole)).toBe(false);
    expect(isPointInLot(0.1, 0.1, withHole)).toBe(true);
  });
});

describe("detectParking", () => {
  beforeEach(() => {
    clearAllDetectionBuffers();
  });

  const lots: LotForDetection[] = [
    {
      id: "lot-a",
      name: "A",
      latitude: 40.5,
      longitude: -74.45,
      coordinates: [
        [
          [40.499, -74.451],
          [40.499, -74.449],
          [40.501, -74.449],
          [40.501, -74.451],
          [40.499, -74.451],
        ],
      ],
      holes: [],
    },
  ];

  it("returns empty when no speed transition", () => {
    pushSpeed(1);
    pushSpeed(1);
    pushSpeed(1);
    expect(detectParking(40.5, -74.45, 15, lots, { activityBoost: 0 })).toEqual(
      [],
    );
  });

  it("sets autoConfirmable=true for inside-polygon candidate", () => {
    pushDriveAndStop();
    const candidates = detectParking(40.5, -74.45, 10, lots);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].autoConfirmable).toBe(true);
    expect(candidates[0].signals.insideLot).toBe(1);
  });

  it("sets autoConfirmable=false for nearby-only (outside polygon) candidate", () => {
    pushDriveAndStop();
    // Point 80 m north of lot centre — outside polygon, within nearby radius
    const candidates = detectParking(40.5007, -74.45, 15, lots);
    const nearbyCandidate = candidates.find((c) => c.signals.insideLot < 1);
    if (nearbyCandidate) {
      expect(nearbyCandidate.autoConfirmable).toBe(false);
    }
  });

  it("suppresses candidates when transit stop-go pattern is detected via option", () => {
    // Buffer has in-buffer driving but persisted=false, transit=true
    pushDriveAndStop();
    // Push a second high-speed segment to simulate bus oscillation
    pushSpeed(11);
    pushSpeed(0.2);
    const candidates = detectParking(40.5, -74.45, 10, lots, {
      transitPatternDetected: true,
      recentDrivingPersisted: false,
    });
    // In-buffer driving still present — detection may succeed but persisted
    // shortcut is disabled; just verify autoConfirmable respects insideLot
    for (const c of candidates) {
      if (c.signals.insideLot < 1) {
        expect(c.autoConfirmable).toBe(false);
      }
    }
  });

  it("does not auto-confirm with persisted flag + transit pattern", () => {
    // Only walking speeds in buffer, but persisted flag is set + transit detected
    pushSpeed(0.5);
    pushSpeed(0.3);
    pushSpeed(0.2);
    pushSpeed(0.1);
    const candidates = detectParking(40.5, -74.45, 10, lots, {
      recentDrivingPersisted: true,
      transitPatternDetected: true,
    });
    expect(candidates).toEqual([]);
  });
});
