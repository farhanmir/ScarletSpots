import { describe, expect, it } from "vitest";

import {
  occupancyRowsToMap,
  type BackendOccupancyRow,
  type RutgersLot,
} from "./lots";

describe("occupancyRowsToMap", () => {
  const sampleLot: RutgersLot = {
    id: "10001",
    name: "Sample Lot",
    shortName: "Lot 1",
    campus: "Busch",
    latitude: 40.5,
    longitude: -74.45,
    capacity: 100,
    generalAvailable: 100,
    handicapped: 0,
    evCharging: 0,
    garage: false,
    uncovered: true,
    regularGate: false,
    smartGate: false,
    student: true,
    employee: true,
    empHours: "",
    note: "",
    photos: [],
    coordinates: [],
    simplifiedCoordinates: [],
    holes: [],
    occupiedCount: 0,
    occupancyRate: 0,
  };

  it("keeps seeded occupancy values from backend payload", () => {
    const rows: BackendOccupancyRow[] = [
      { lot_id: "10001", count: 63, source: "seeded_heuristic" },
    ];
    const lotIndex = new Map([[sampleLot.id, sampleLot]]);
    const out = occupancyRowsToMap(rows, lotIndex);
    expect(out["10001"]).toBe(63);
  });

  it("clamps count to lot capacity", () => {
    const rows: BackendOccupancyRow[] = [
      { lot_id: "10001", count: 999, source: "seeded_heuristic" },
    ];
    const lotIndex = new Map([[sampleLot.id, sampleLot]]);
    const out = occupancyRowsToMap(rows, lotIndex);
    expect(out["10001"]).toBe(100);
  });
});
