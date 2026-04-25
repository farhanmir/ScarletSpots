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

const RAW_DATA: RawLot[] = require("./rutgers_parking_data.json");
const PERMIT_MAPPING: Record<
  string,
  { id: string; name: string }[]
> = require("./permit_mapping.json");

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
  regularGate: boolean;
  smartGate: boolean;
  student: boolean;
  employee: boolean;
  /** Operating hours / notes. */
  empHours: string;
  note: string;
  /** Photo URLs (from Firebase Storage). */
  photos: string[];
  /**
   * Polygon boundaries for map rendering and geofencing. Each item is a separate
   * polygon (for MultiPolygons that have disconnected shapes).
   * Format: [latitude, longitude][] — converted from GeoJSON [lng, lat].
   */
  coordinates: [number, number][][];

  /**
   * Downsampled polygon boundaries for low-detail map rendering.
   */
  simplifiedCoordinates: [number, number][][];

  /**
   * Interior hole rings for lots whose boundary has cutouts.
   * Matches 1-to-1 with the `coordinates` array (an array of hole arrays per polygon).
   */
  holes: [number, number][][][];

  // ── Dynamic fields populated at runtime from lot_occupancy table ──────────
  /** Number of active parking sessions at this lot right now. */
  occupiedCount: number;
  /** occupiedCount / capacity * 100 (0–100). */
  occupancyRate: number;
}

export interface BackendOccupancyRow {
  lot_id: string;
  count?: number | null;
  occupancy_rate?: number | null;
  source?: "realtime" | "seeded_heuristic" | "ml" | string;
}

// ── Campus filter constants ────────────────────────────────────────────────

/** Region codes treated as "New Brunswick" (default enabled campus). */
export const NB_REGION_CODE = "NB";

/** All known campus names for NB region (for UI grouping). */
export const NB_CAMPUS_NAMES = [
  "Busch",
  "College Ave",
  "Livingston",
  "Cook",
  "Douglass",
  "Health - Piscataway",
  "Health - New Brunswick",
];

// ── Polygon simplification ────────────────────────────────────────────────

/**
 * Returns a downsampled copy of `ring` by keeping every `step`-th point.
 * Always retains the first and last point so the ring stays closed.
 * Guarantees at least 3 points for a valid polygon; returns the original
 * array when it is already too small to benefit from simplification.
 */
function simplifyRing(ring: [number, number][], step = 3): [number, number][] {
  if (ring.length <= step * 2) return ring;
  const result: [number, number][] = [];
  for (let i = 0; i < ring.length; i++) {
    if (i === 0 || i === ring.length - 1 || i % step === 0) {
      result.push(ring[i]);
    }
  }
  return result.length >= 3 ? result : ring;
}

// ── Internal converter ─────────────────────────────────────────────────────

function rawToLot(raw: RawLot): RutgersLot {
  // GeoJSON uses [longitude, latitude] — swap to [latitude, longitude] for
  // react-native-maps Polygon / expo-location Geofencing.
  //
  let parsedPolygons: {
    outer: [number, number][];
    holes: [number, number][][];
  }[] = [];

  const rings: any[] | undefined = raw.gtfsGeometry?.coordinates;

  if (rings && rings.length > 0) {
    if (raw.gtfsGeometry?.type === "Polygon") {
      // coordinates[0] = outer boundary, coordinates[1..] = holes
      parsedPolygons.push({
        outer: rings[0],
        holes: rings.slice(1),
      });
    } else if (raw.gtfsGeometry?.type === "MultiPolygon") {
      // MultiPolygon format for this specific dataset is non-standard.
      // It stores the geometry as a flat array of rings: [number, number][][]
      // Each ring represents an outer boundary of a disconnected part of the lot.
      rings.forEach((ring) => {
        if (ring.length >= 3) {
          parsedPolygons.push({
            outer: ring,
            holes: [],
          });
        }
      });
    }
  }

  // Fallback if empty
  if (parsedPolygons.length === 0) {
    parsedPolygons.push({ outer: [], holes: [] });
  }

  const coordinates: [number, number][][] = parsedPolygons.map((p) =>
    p.outer.map(([lng, lat]) => [lat, lng] as [number, number]),
  );

  const holes: [number, number][][][] = parsedPolygons.map((p) =>
    p.holes.map((ring) =>
      ring.map(([lng, lat]) => [lat, lng] as [number, number]),
    ),
  );

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
    regularGate: raw.regularGate ?? false,
    smartGate: raw.smartGate ?? false,
    student: raw.student ?? false,
    employee: raw.employee ?? false,
    empHours: raw.empHours ?? "",
    note: raw.note ?? "",
    photos: raw.photos ?? [],
    coordinates,
    simplifiedCoordinates: coordinates.map((ring) => simplifyRing(ring)),
    holes,
    occupiedCount: 0,
    occupancyRate: 0,
  };
}

// ── Pre-computed collections (parsed once at module load) ──────────────────

/** All NB lots (193 lots, the default campus group). */
const NB_LOTS: RutgersLot[] = RAW_DATA.filter(
  (r) => r.active && r.address.regionCode === NB_REGION_CODE,
).map(rawToLot);

/** All 245 active lots across every campus. */
const ALL_LOTS: RutgersLot[] = RAW_DATA.filter((r) => r.active).map(rawToLot);

/** Index by mapId for O(1) lookups. */
const LOT_INDEX: Map<string, RutgersLot> = new Map(
  ALL_LOTS.map((l) => [l.id, l]),
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
  occupancyMap: Record<string, number>,
): RutgersLot[] {
  for (const lot of lots) {
    const count = occupancyMap[lot.id] ?? 0;
    lot.occupiedCount = count;
    lot.occupancyRate =
      lot.capacity > 0 ? Math.min(100, (count / lot.capacity) * 100) : 0;
  }
  return lots;
}

/**
 * Converts backend occupancy rows into a normalized lot_id -> count map.
 * Supports seeded heuristic rows where source may be "seeded_heuristic".
 */
export function occupancyRowsToMap(
  rows: BackendOccupancyRow[],
  lotIndex?: Map<string, RutgersLot>,
): Record<string, number> {
  const occupancyMap: Record<string, number> = {};
  for (const row of rows) {
    const lotId = String(row?.lot_id ?? "");
    if (!lotId) continue;

    const lot = lotIndex?.get(lotId);
    const capacity = Math.max(0, lot?.capacity ?? 0);
    const rawCount = Number(row?.count ?? 0);
    const normalized = Number.isFinite(rawCount) ? rawCount : 0;

    occupancyMap[lotId] =
      capacity > 0
        ? Math.min(capacity, Math.max(0, Math.round(normalized)))
        : Math.max(0, Math.round(normalized));
  }
  return occupancyMap;
}

// ── Permit helpers ─────────────────────────────────────────────────────────

/**
 * Sorted list of every real permit type name from permit_mapping.json.
 * Used to populate the permit picker UI.
 */
export const ALL_PERMIT_TYPES: string[] = Object.keys(PERMIT_MAPPING).sort();

/**
 * Returns the set of lot mapIds accessible with the given permit type.
 * Returns an empty Set for unknown/null permit types.
 */
export function getPermitLotIds(
  permitType: string | null | undefined,
): Set<string> {
  if (!permitType) return new Set();
  const entries = PERMIT_MAPPING[permitType] ?? [];
  return new Set(entries.map((e) => e.id));
}

/**
 * Returns the set of lot mapIds accessible with the primary permit AND secondary permit combined.
 */
export function getPermitLotIdsUnion(
  primary: string | null | undefined,
  secondary: string | null | undefined,
): Set<string> {
  const primaryIds = getPermitLotIds(primary);
  const secondaryIds = getPermitLotIds(secondary);
  if (secondaryIds.size === 0) return primaryIds;
  if (primaryIds.size === 0) return secondaryIds;
  return new Set([...primaryIds, ...secondaryIds]);
}

/**
 * Pre-computed union of all lots accessible via any *Commuter permit.
 * Used for the "No permit — show all commuter lots" mode.
 */
export const ALL_COMMUTER_LOT_IDS: Set<string> = new Set(
  Object.entries(PERMIT_MAPPING)
    .filter(([key]) => key.toLowerCase().includes("commuter"))
    .flatMap(([, entries]) => entries.map((e) => e.id)),
);

// ── Permit schedule helpers ────────────────────────────────────────────────

interface ScheduleSlot {
  start: string; // "06:00"
  end: string; // "24:00"
}

interface ScheduleInfo {
  schedule: ScheduleSlot[][]; // 7-element array (Sun=0 … Sat=6)
  time_text_1: string; // e.g. "Monday - Friday, 5PM - 12AM"
  time_text_2: string; // e.g. "Saturday - Sunday, 6AM - 12AM"
}

type PermitSchedules = Record<string, Record<string, ScheduleInfo>>;

const PERMIT_SCHEDULES: PermitSchedules = require("./permit_schedules.json");

/**
 * Returns the schedule info (time text strings + schedule array) for a lot
 * under a specific permit type. Returns null if no schedule data exists.
 */
export function getLotScheduleInfo(
  permitType: string | null | undefined,
  lotId: string,
): { time_text_1: string; time_text_2: string } | null {
  if (!permitType) return null;
  const info = PERMIT_SCHEDULES[permitType]?.[lotId];
  if (!info) return null;
  if (!info.time_text_1 && !info.time_text_2) return null;
  return { time_text_1: info.time_text_1, time_text_2: info.time_text_2 };
}

/**
 * Checks whether a lot is currently within operating hours for the given
 * permit type.
 *
 * @returns `true` if available now, `false` if outside hours, `null` if
 *   no schedule data exists (treat as always available).
 */
export function isLotAvailableNow(
  permitType: string | null | undefined,
  lotId: string,
  now: Date = new Date(),
): boolean | null {
  if (!permitType) return null;
  const info = PERMIT_SCHEDULES[permitType]?.[lotId];
  if (!info?.schedule) return null;

  const dayIndex = now.getDay(); // 0=Sun, 1=Mon … 6=Sat
  const daySlots = info.schedule[dayIndex];

  // No slots for today → lot is closed today for this permit
  if (!daySlots || daySlots.length === 0) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const slot of daySlots) {
    const [startH, startM] = slot.start.split(":").map(Number);
    const [endH, endM] = slot.end.split(":").map(Number);
    const startMin = startH * 60 + startM;
    const endMin = endH * 60 + endM;

    if (currentMinutes >= startMin && currentMinutes < endMin) {
      return true;
    }
  }

  return false;
}

/**
 * Secondary permit rule override for "main lots":
 * Monday-Friday, 10:00-24:00 only.
 *
 * A lot is treated as a "main lot" when its base permit schedule text is
 * full-access style:
 *   - Monday - Friday, 6AM - 12AM
 *   - Saturday - Sunday, 6AM - 12AM
 */
export function isSecondaryPermitAvailableNow(
  permitType: string | null | undefined,
  lotId: string,
  now: Date = new Date(),
): boolean | null {
  if (!permitType) return null;
  const info = PERMIT_SCHEDULES[permitType]?.[lotId];
  if (!info?.schedule) return null;

  const text1 = (info.time_text_1 ?? "").trim().toLowerCase();
  const text2 = (info.time_text_2 ?? "").trim().toLowerCase();
  const isMainLotSchedule =
    text1 === "monday - friday, 6am - 12am" &&
    text2 === "saturday - sunday, 6am - 12am";

  if (isMainLotSchedule) {
    const dayIndex = now.getDay(); // 0=Sun ... 6=Sat
    if (dayIndex === 0 || dayIndex === 6) return false;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return currentMinutes >= 10 * 60 && currentMinutes < 24 * 60;
  }

  return isLotAvailableNow(permitType, lotId, now);
}
