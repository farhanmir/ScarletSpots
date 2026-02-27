/**
 * lots.ts — Static Rutgers parking lot data wrapper.
 *
 * All 245 Rutgers parking lots are bundled directly into the app from
 * rutgers_parking_data.json (1.4 MB). This eliminates all API calls for
 * lot metadata, polygons, capacity, and photos.
 *
 * Dynamic occupancy (how many cars are parked right now) is the ONLY lot
 * data that comes from the backend — via the lot_occupancy Supabase table.
 *
 * Data source: Rutgers University GTFS / parking data export.
 * Update frequency: Lots change rarely (new lots, re-striping). Update via
 * app release when needed.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const RAW_DATA: RawLot[] = require('./rutgers_parking_data.json');

// ── Raw JSON shape (as received from data source) ──────────────────────────

interface RawLot {
  active: boolean;
  mapId: string;
  propertyCode: string;
  propertyName: string;
  shortName: string;
  address: {
    address1?: string;
    cityCode?: string;
    regionCode: string; // 'NB' | 'NW' | 'CM' | 'PISCAT' etc.
    siteCode?: string;
    campus: string;
  };
  location: { lat: number; lng: number };
  totalSpaces: number;
  generalAvailable: number;
  visitor: number;
  handicapped: number;
  evCharging: number;
  fifteenMin: number;
  foodTruck: number;
  garage: boolean;
  solar: boolean;
  uncovered: boolean;
  regularGate: boolean;
  smartGate: boolean;
  student: boolean;
  employee: boolean;
  evChargeInfo: string;
  empHours: string;
  note: string;
  photos: string[];
  gtfsProperties?: {
    lotName: string;
    latitude: number;
    longitude: number;
    parkingId: string;
    siteId: string;
    campus: string;
    district: string;
  };
  gtfsGeometry?: {
    type: string;
    // GeoJSON format: [longitude, latitude]
    coordinates: [number, number][][];
  };
}

// ── Public lot type used throughout the app ────────────────────────────────

export interface RutgersLot {
  /** mapId from the data source — used as lot_id in parking_sessions. */
  id: string;
  /** Full property name e.g. "Lot 613 Stadium West". */
  name: string;
  /** Short display name e.g. "Lot 613". */
  shortName: string;
  campus: string;
  latitude: number;
  longitude: number;
  /** Total parking spaces. */
  capacity: number;
  /** General/commuter available spaces. */
  generalAvailable: number;
  handicapped: number;
  evCharging: number;
  garage: boolean;
  uncovered: boolean;
  student: boolean;
  employee: boolean;
  /** Operating hours / notes. */
  empHours: string;
  note: string;
  /** Photo URLs (from Firebase Storage). */
  photos: string[];
  /**
   * Polygon boundary for map rendering and geofencing.
   * Format: [latitude, longitude][] — converted from GeoJSON [lng, lat].
   */
  coordinates: [number, number][];

  // ── Dynamic fields populated at runtime from lot_occupancy table ──────────
  /** Number of active parking sessions at this lot right now. */
  occupiedCount: number;
  /** occupiedCount / capacity * 100 (0–100). */
  occupancyRate: number;
}

// ── Campus filter constants ────────────────────────────────────────────────

/** Region codes treated as "New Brunswick" (default enabled campus). */
export const NB_REGION_CODE = 'NB';

/** All known campus names for NB region (for UI grouping). */
export const NB_CAMPUS_NAMES = [
  'Busch',
  'College Ave',
  'Livingston',
  'Cook',
  'Douglass',
  'Health - Piscataway',
  'Health - New Brunswick',
];

// ── Internal converter ─────────────────────────────────────────────────────

function rawToLot(raw: RawLot): RutgersLot {
  // GeoJSON uses [longitude, latitude] — swap to [latitude, longitude] for
  // react-native-maps Polygon / expo-location Geofencing.
  const coordinates: [number, number][] =
    raw.gtfsGeometry?.coordinates?.[0]?.map(
      ([lng, lat]) => [lat, lng] as [number, number]
    ) ?? [];

  return {
    id: raw.mapId,
    name: raw.propertyName,
    shortName: raw.shortName,
    campus: raw.address.campus,
    latitude: raw.location.lat,
    longitude: raw.location.lng,
    capacity: raw.totalSpaces ?? 0,
    generalAvailable: raw.generalAvailable ?? 0,
    handicapped: raw.handicapped ?? 0,
    evCharging: raw.evCharging ?? 0,
    garage: raw.garage ?? false,
    uncovered: raw.uncovered ?? false,
    student: raw.student ?? false,
    employee: raw.employee ?? false,
    empHours: raw.empHours ?? '',
    note: raw.note ?? '',
    photos: raw.photos ?? [],
    coordinates,
    occupiedCount: 0,
    occupancyRate: 0,
  };
}

// ── Pre-computed collections (parsed once at module load) ──────────────────

/** All NB lots (193 lots, the default campus group). */
const NB_LOTS: RutgersLot[] = RAW_DATA
  .filter((r) => r.active && r.address.regionCode === NB_REGION_CODE)
  .map(rawToLot);

/** All 245 active lots across every campus. */
const ALL_LOTS: RutgersLot[] = RAW_DATA
  .filter((r) => r.active)
  .map(rawToLot);

/** Index by mapId for O(1) lookups. */
const LOT_INDEX: Map<string, RutgersLot> = new Map(
  ALL_LOTS.map((l) => [l.id, l])
);

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns the lot list for the app.
 *
 * @param includeAllCampuses When false (default), returns New Brunswick lots
 *   only. Pass true to include Newark, Camden, and Piscataway.
 */
export function getAllLots(includeAllCampuses = false): RutgersLot[] {
  // Return fresh copies so callers can mutate occupiedCount/occupancyRate
  // without affecting the cached arrays.
  return includeAllCampuses
    ? ALL_LOTS.map((l) => ({ ...l }))
    : NB_LOTS.map((l) => ({ ...l }));
}

/**
 * O(1) lookup of a lot by its mapId.
 * Returns a fresh copy so callers can safely mutate occupancy fields.
 */
export function getLotById(id: string): RutgersLot | undefined {
  const lot = LOT_INDEX.get(id);
  return lot ? { ...lot } : undefined;
}

/**
 * Merge live occupancy data (from lot_occupancy table) into a lot array.
 * Mutates the passed array in place for performance — call with a fresh copy.
 *
 * @param lots The lot array to update (should be a copy from getAllLots()).
 * @param occupancyMap Map of lot_id → count from the lot_occupancy table.
 */
export function applyOccupancy(
  lots: RutgersLot[],
  occupancyMap: Record<string, number>
): RutgersLot[] {
  for (const lot of lots) {
    const count = occupancyMap[lot.id] ?? 0;
    lot.occupiedCount = count;
    lot.occupancyRate =
      lot.capacity > 0 ? Math.min(100, (count / lot.capacity) * 100) : 0;
  }
  return lots;
}
