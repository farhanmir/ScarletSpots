import Foundation
import CoreLocation

// MARK: - Campus constants

enum CampusConstants {
    /// Region code marking a lot as New Brunswick (default enabled region).
    static let newBrunswickRegionCode = "NB"

    /// Every campus label that appears in the NB region dataset. These are the
    /// strings that show up inside `Address.campus` for an NB lot.
    static let newBrunswickCampusNames: [String] = [
        "Busch",
        "College Ave",
        "Livingston",
        "Cook",
        "Douglass",
        "Health - Piscataway",
        "Health - New Brunswick"
    ]
}

// MARK: - Raw JSON (decoded directly from rutgers_parking_data.json)

/// Raw lot shape as it appears in `rutgers_parking_data.json`.
///
/// Modeled as a separate struct from `Lot` so decoding stays tolerant of
/// legacy/missing fields in the data without polluting the runtime type.
struct RawLot: Codable {
    let active: Bool?
    let mapId: String
    let propertyCode: String?
    let propertyName: String
    let shortName: String
    let address: Address
    let location: Coordinate
    let totalSpaces: Int?
    let generalAvailable: Int?
    let visitor: Int?
    let handicapped: Int?
    let evCharging: Int?
    let fifteenMin: Int?
    let foodTruck: Int?
    let garage: Bool?
    let solar: Bool?
    let uncovered: Bool?
    let regularGate: Bool?
    let smartGate: Bool?
    let student: Bool?
    let employee: Bool?
    let evChargeInfo: String?
    let empHours: String?
    let note: String?
    let photos: [String]?
    let gtfsGeometry: RawGeometry?
}

struct RawGeometry: Codable {
    let type: String
    /// GeoJSON `[[[lng, lat]]]` for Polygon. For this dataset's non-standard
    /// MultiPolygon variant, it's a flat list of outer rings (no nesting).
    let coordinates: [[[Double]]]
}

// MARK: - Address / Coordinate shared value types

struct Address: Codable {
    let address1: String?
    let cityCode: String?
    let regionCode: String?
    let siteCode: String?
    let campus: String?
}

struct Coordinate: Codable {
    let lat: Double
    let lng: Double

    var clLocationCoordinate2D: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }
}

// MARK: - Runtime lot shape used by the UI

/// A single parking lot, in the shape the rest of the app consumes.
///
/// The `Lot` constructor normalizes `RawGeometry` into a list of polygons and
/// their interior holes, collapsing both Polygon and MultiPolygon geometry
/// into the same structure. Callers can render every polygon or use the first
/// one for a representative shape.
struct Lot: Identifiable, Hashable {
    /// Polygon = outer boundary + zero or more hole rings.
    struct PolygonRing: Hashable {
        /// Outer ring of `(lat, lng)` pairs.
        let outer: [CLLocationCoordinate2D]
        /// Hole rings cut out of the outer ring (one list per hole).
        let holes: [[CLLocationCoordinate2D]]

        static func == (lhs: PolygonRing, rhs: PolygonRing) -> Bool {
            guard lhs.outer.count == rhs.outer.count,
                  lhs.holes.count == rhs.holes.count else { return false }
            return zip(lhs.outer, rhs.outer).allSatisfy { $0.latitude == $1.latitude && $0.longitude == $1.longitude }
        }

        func hash(into hasher: inout Hasher) {
            hasher.combine(outer.count)
            hasher.combine(holes.count)
        }
    }

    let id: String
    let active: Bool
    let mapId: String
    let propertyCode: String
    let propertyName: String
    let shortName: String
    let address: Address
    let location: Coordinate
    let totalSpaces: Int
    let generalAvailable: Int
    let visitor: Int
    let handicapped: Int
    let evCharging: Int
    let fifteenMin: Int
    let foodTruck: Int
    let garage: Bool
    let solar: Bool
    let uncovered: Bool
    let regularGate: Bool
    let smartGate: Bool
    let student: Bool
    let employee: Bool
    let evChargeInfo: String?
    let empHours: String
    let note: String
    let photos: [String]
    /// One or more disjoint polygons composing the lot boundary.
    /// Empty if no geometry was provided in the source data.
    let polygons: [PolygonRing]

    init(raw: RawLot) {
        self.mapId = raw.mapId
        self.id = raw.mapId
        self.active = raw.active ?? true
        self.propertyCode = raw.propertyCode ?? ""
        self.propertyName = raw.propertyName
        self.shortName = raw.shortName
        self.address = raw.address
        self.location = raw.location
        self.totalSpaces = raw.totalSpaces ?? 0
        self.generalAvailable = raw.generalAvailable ?? 0
        self.visitor = raw.visitor ?? 0
        self.handicapped = raw.handicapped ?? 0
        self.evCharging = raw.evCharging ?? 0
        self.fifteenMin = raw.fifteenMin ?? 0
        self.foodTruck = raw.foodTruck ?? 0
        self.garage = raw.garage ?? false
        self.solar = raw.solar ?? false
        self.uncovered = raw.uncovered ?? true
        self.regularGate = raw.regularGate ?? false
        self.smartGate = raw.smartGate ?? false
        self.student = raw.student ?? false
        self.employee = raw.employee ?? false
        self.evChargeInfo = raw.evChargeInfo
        self.empHours = raw.empHours ?? ""
        self.note = raw.note ?? ""
        self.photos = raw.photos ?? []

        self.polygons = Lot.parsePolygons(from: raw.gtfsGeometry)
    }

    // Transient initializer used by unit tests and in-memory construction.
    init(
        mapId: String,
        shortName: String,
        propertyName: String,
        campus: String? = nil,
        regionCode: String? = "NB",
        location: Coordinate,
        totalSpaces: Int = 0,
        polygons: [PolygonRing] = []
    ) {
        self.id = mapId
        self.mapId = mapId
        self.active = true
        self.propertyCode = ""
        self.propertyName = propertyName
        self.shortName = shortName
        self.address = Address(address1: nil, cityCode: nil, regionCode: regionCode, siteCode: nil, campus: campus)
        self.location = location
        self.totalSpaces = totalSpaces
        self.generalAvailable = 0
        self.visitor = 0
        self.handicapped = 0
        self.evCharging = 0
        self.fifteenMin = 0
        self.foodTruck = 0
        self.garage = false
        self.solar = false
        self.uncovered = true
        self.regularGate = false
        self.smartGate = false
        self.student = false
        self.employee = false
        self.evChargeInfo = nil
        self.empHours = ""
        self.note = ""
        self.photos = []
        self.polygons = polygons
    }

    static func == (lhs: Lot, rhs: Lot) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    /// Convenience accessor for the outer ring of the first polygon. Most
    /// legacy call sites only need a single ring; iterate `polygons` for the
    /// full MultiPolygon shape.
    var primaryOuterRing: [CLLocationCoordinate2D] {
        polygons.first?.outer ?? []
    }
}

// MARK: - Geometry parsing

private extension Lot {
    static func parsePolygons(from geometry: RawGeometry?) -> [PolygonRing] {
        guard let geometry, !geometry.coordinates.isEmpty else { return [] }

        switch geometry.type {
        case "Polygon":
            // coordinates[0] is the outer ring. Any following rings are holes.
            let rings = geometry.coordinates
            let outer = Self.coordinates(from: rings[0])
            let holes = rings.dropFirst().map(Self.coordinates(from:))
            guard outer.count >= 3 else { return [] }
            return [PolygonRing(outer: outer, holes: holes)]

        case "MultiPolygon":
            // This dataset stores MultiPolygon as a flat [[[lng, lat]]] where
            // each element is a separate outer ring (non-standard). Any ring
            // with < 3 points is discarded.
            return geometry.coordinates
                .map(Self.coordinates(from:))
                .filter { $0.count >= 3 }
                .map { PolygonRing(outer: $0, holes: []) }

        default:
            return []
        }
    }

    static func coordinates(from ring: [[Double]]) -> [CLLocationCoordinate2D] {
        ring.compactMap { point in
            guard point.count >= 2 else { return nil }
            // GeoJSON is (lng, lat).
            return CLLocationCoordinate2D(latitude: point[1], longitude: point[0])
        }
    }
}
