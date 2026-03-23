/**
 * Minimal lot shapes for background parking detection — derived from bundled
 * static data (same source as map polygons). No network; no parking_lots table.
 */
import { ENABLE_ALL_CAMPUSES } from "./featureFlags";
import { getAllLots, type RutgersLot } from "@/shared/constants/lots";
import type { LotForDetection } from "@/shared/services/ParkingDetectionService";

function rutgersLotToDetection(lot: RutgersLot): LotForDetection {
  return {
    id: lot.id,
    name: lot.name,
    latitude: lot.latitude,
    longitude: lot.longitude,
    coordinates: lot.coordinates,
    holes: lot.holes,
  };
}

/**
 * Polygons + centers for `detectParking` / background tasks.
 * Uses the same campus scope as the map (`ENABLE_ALL_CAMPUSES`).
 */
export function getLotsForDetection(): LotForDetection[] {
  return getAllLots(ENABLE_ALL_CAMPUSES).map(rutgersLotToDetection);
}
