import Foundation
import CoreLocation

/// In-memory cache of lot metadata backed by the bundled `scarletspots.sqlite`.
///
/// Scalars + polygon rings are loaded once at init time so SwiftUI views can
/// keep using the same synchronous `@Published` arrays they always have. The
/// win over the old JSON loader is faster startup (no 1.4 MB decode) plus the
/// ability to query the database directly for search (`search(_:)`) and point
/// lookup without scanning Swift arrays.
@MainActor
final class LotRepository: ObservableObject {
    static let shared = LotRepository()

    @Published private(set) var lots: [Lot] = []
    @Published private(set) var lotsById: [String: Lot] = [:]

    private let db = Database.shared

    private init() {
        load()
    }

    func load() {
        let loaded = Self.loadAllLots(db: db)
        self.lots = loaded
        self.lotsById = Dictionary(uniqueKeysWithValues: loaded.map { ($0.mapId, $0) })
        Logger.log("LotRepository: loaded \(loaded.count) lots from sqlite")
    }

    // MARK: - Queries

    func byId(_ id: String) -> Lot? { lotsById[id] }

    /// New Brunswick-only subset (default app experience). Pass
    /// `includeAllCampuses: true` to surface every campus.
    func getAll(includeAllCampuses: Bool) -> [Lot] {
        if includeAllCampuses { return lots }
        return lots.filter { $0.address.regionCode == CampusConstants.newBrunswickRegionCode }
    }

    /// Filter lots to only those whose campus label matches one of `campuses`.
    /// Empty `campuses` returns an empty array (i.e. user disabled every
    /// campus toggle).
    func byCampus(_ campuses: Set<String>) -> [Lot] {
        guard !campuses.isEmpty else { return [] }
        let expanded = Self.expandCampusNames(campuses)
        return lots.filter {
            guard let campus = $0.address.campus else { return false }
            return expanded.contains(campus)
        }
    }

    /// Accepts user-friendly campus toggles ("Cook/Douglass" meaning both
    /// "Cook" and "Douglass" in the lot data) and expands them to the set of
    /// raw campus labels that actually appear in the dataset.
    static func expandCampusNames(_ input: Set<String>) -> Set<String> {
        var result = Set<String>()
        for entry in input {
            if entry.contains("/") {
                for piece in entry.split(separator: "/") {
                    let trimmed = piece.trimmingCharacters(in: .whitespaces)
                    if !trimmed.isEmpty { result.insert(trimmed) }
                }
            } else {
                result.insert(entry)
            }
        }
        return result
    }

    /// Return the first lot whose boundary polygon contains `coordinate`.
    /// Handles MultiPolygon lots by testing each polygon independently and
    /// respects interior holes (a point inside a hole is NOT inside the lot).
    func lotContaining(_ coordinate: CLLocationCoordinate2D) -> Lot? {
        lots.first { lot in
            lot.polygons.contains { ring in
                GeometryMath.pointInPolygon(coordinate, polygon: ring.outer) &&
                    !ring.holes.contains(where: { GeometryMath.pointInPolygon(coordinate, polygon: $0) })
            }
        }
    }

    /// FTS5-backed typeahead for the Search tab. Short queries fall back to
    /// a plain substring scan since the trigram tokenizer can't index 1–2
    /// character tokens. Results preserve the order lots appear in the
    /// backing array for consistent UI ordering.
    func search(_ term: String, includeAllCampuses: Bool, limit: Int = 20) -> [Lot] {
        let normalized = term.trimmingCharacters(in: .whitespacesAndNewlines)
        let pool = getAll(includeAllCampuses: includeAllCampuses)

        if normalized.isEmpty {
            return Array(pool.prefix(limit))
        }

        if let phrase = FTS5.phraseQuery(normalized) {
            let matchIds = Set(
                db.select(
                    "SELECT map_id FROM lots_fts WHERE lots_fts MATCH ?",
                    bindings: [phrase]
                ) { $0.stringOrEmpty(0) }
            )
            if !matchIds.isEmpty {
                return Array(pool.filter { matchIds.contains($0.mapId) }.prefix(limit))
            }
        }

        // Fallback: substring scan for queries < 3 chars or when FTS finds nothing.
        let lowered = normalized.lowercased()
        return Array(
            pool
                .filter {
                    $0.shortName.lowercased().contains(lowered)
                        || $0.propertyName.lowercased().contains(lowered)
                        || ($0.address.campus?.lowercased().contains(lowered) ?? false)
                }
                .prefix(limit)
        )
    }
}

// MARK: - SQLite decoding

private extension LotRepository {
    /// Columns must match the order in the SELECT below.
    static let lotColumns = """
        map_id, active, property_code, property_name, short_name,
        address1, city_code, region_code, site_code, campus,
        latitude, longitude, total_spaces, general_available, visitor,
        handicapped, ev_charging, fifteen_min, food_truck,
        garage, solar, uncovered, regular_gate, smart_gate,
        student, employee, ev_charge_info, emp_hours, note, photos_json
    """

    static func loadAllLots(db: Database) -> [Lot] {
        let polygons = loadPolygons(db: db)
        return db.select(
            "SELECT \(lotColumns) FROM lots WHERE active = 1 ORDER BY map_id"
        ) { stmt in
            let mapId = stmt.stringOrEmpty(0)
            return Lot(
                mapId: mapId,
                active: stmt.bool(1),
                propertyCode: stmt.stringOrEmpty(2),
                propertyName: stmt.stringOrEmpty(3),
                shortName: stmt.stringOrEmpty(4),
                address: Address(
                    address1: stmt.string(5),
                    cityCode: stmt.string(6),
                    regionCode: stmt.string(7),
                    siteCode: stmt.string(8),
                    campus: stmt.string(9)
                ),
                location: Coordinate(lat: stmt.double(10), lng: stmt.double(11)),
                totalSpaces: stmt.int(12),
                generalAvailable: stmt.int(13),
                visitor: stmt.int(14),
                handicapped: stmt.int(15),
                evCharging: stmt.int(16),
                fifteenMin: stmt.int(17),
                foodTruck: stmt.int(18),
                garage: stmt.bool(19),
                solar: stmt.bool(20),
                uncovered: stmt.bool(21),
                regularGate: stmt.bool(22),
                smartGate: stmt.bool(23),
                student: stmt.bool(24),
                employee: stmt.bool(25),
                evChargeInfo: stmt.string(26),
                empHours: stmt.stringOrEmpty(27),
                note: stmt.stringOrEmpty(28),
                photos: decodePhotos(stmt.string(29)),
                polygons: polygons[mapId] ?? []
            )
        }
    }

    /// Read every polygon ring into a `[lot_id: [PolygonRing]]` map in a
    /// single scan. Rings arrive sorted by (polygon_index, ring_index), which
    /// lets us build one `PolygonRing` per polygon by stashing the outer ring
    /// and appending holes as they come in.
    static func loadPolygons(db: Database) -> [String: [Lot.PolygonRing]] {
        struct Accumulator {
            var outer: [CLLocationCoordinate2D] = []
            var holes: [[CLLocationCoordinate2D]] = []
        }
        var byLot: [String: [Int: Accumulator]] = [:]

        db.query(
            """
            SELECT lot_id, polygon_index, is_outer, points
            FROM lot_polygons
            ORDER BY lot_id, polygon_index, ring_index
            """
        ) { stmt in
            while stmt.step() {
                let lotId = stmt.stringOrEmpty(0)
                let polygonIndex = stmt.int(1)
                let isOuter = stmt.bool(2)
                let coords = decodeRing(stmt.doubles(3))
                if coords.count < 3 { continue }

                var polygonMap = byLot[lotId] ?? [:]
                var acc = polygonMap[polygonIndex] ?? Accumulator()
                if isOuter {
                    acc.outer = coords
                } else {
                    acc.holes.append(coords)
                }
                polygonMap[polygonIndex] = acc
                byLot[lotId] = polygonMap
            }
        }

        var out: [String: [Lot.PolygonRing]] = [:]
        for (lotId, polygonMap) in byLot {
            let rings = polygonMap.keys.sorted().compactMap { index -> Lot.PolygonRing? in
                guard let acc = polygonMap[index], !acc.outer.isEmpty else { return nil }
                return Lot.PolygonRing(outer: acc.outer, holes: acc.holes)
            }
            if !rings.isEmpty {
                out[lotId] = rings
            }
        }
        return out
    }

    /// The points blob is a packed `(lat, lng, lat, lng, …)` run of native
    /// doubles in little-endian order.
    static func decodeRing(_ doubles: [Double]) -> [CLLocationCoordinate2D] {
        var coords: [CLLocationCoordinate2D] = []
        coords.reserveCapacity(doubles.count / 2)
        var index = 0
        while index + 1 < doubles.count {
            coords.append(CLLocationCoordinate2D(latitude: doubles[index], longitude: doubles[index + 1]))
            index += 2
        }
        return coords
    }

    /// `photos_json` is stored as a compact JSON array string (easier than a
    /// join table for a handful of URLs per lot).
    static func decodePhotos(_ json: String?) -> [String] {
        guard let json, !json.isEmpty,
              let data = json.data(using: .utf8),
              let arr = try? JSONDecoder().decode([String].self, from: data)
        else { return [] }
        return arr
    }
}

// MARK: - Geometry helpers

enum GeometryMath {
    /// Ray casting point-in-polygon test. Works on lat/lng pairs since the
    /// relative geometry on the Rutgers campus is small enough that planar
    /// approximation is safe.
    static func pointInPolygon(_ point: CLLocationCoordinate2D, polygon: [CLLocationCoordinate2D]) -> Bool {
        guard polygon.count >= 3 else { return false }
        var inside = false
        var j = polygon.count - 1
        for i in 0..<polygon.count {
            let xi = polygon[i].longitude
            let yi = polygon[i].latitude
            let xj = polygon[j].longitude
            let yj = polygon[j].latitude
            let intersects = ((yi > point.latitude) != (yj > point.latitude))
                && (point.longitude < (xj - xi) * (point.latitude - yi) / ((yj - yi) + 1e-10) + xi)
            if intersects { inside.toggle() }
            j = i
        }
        return inside
    }
}
