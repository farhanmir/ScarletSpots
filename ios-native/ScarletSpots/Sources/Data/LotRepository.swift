import Foundation
import CoreLocation

@MainActor
final class LotRepository: ObservableObject {
    static let shared = LotRepository()

    @Published private(set) var lots: [Lot] = []
    @Published private(set) var lotsById: [String: Lot] = [:]

    private init() {
        load()
    }

    func load() {
        guard let url = Bundle.main.url(forResource: "rutgers_parking_data", withExtension: "json") else {
            Logger.log("LotRepository: rutgers_parking_data.json is missing from the bundle")
            return
        }
        do {
            let data = try Data(contentsOf: url)
            let decoded = try JSONDecoder().decode([RawLot].self, from: data)
            let mapped = decoded
                .filter { $0.active ?? true }
                .map(Lot.init(raw:))
            self.lots = mapped
            self.lotsById = Dictionary(uniqueKeysWithValues: mapped.map { ($0.mapId, $0) })
            Logger.log("LotRepository: loaded \(mapped.count) lots")
        } catch {
            Logger.log("LotRepository: failed to decode lots — \(error)")
        }
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
