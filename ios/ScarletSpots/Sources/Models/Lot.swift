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
/// Hydrated by `LotRepository` from the bundled SQLite database. Multi-polygon
/// lots come back as a list of `PolygonRing`s, each with its own outer
/// boundary plus zero or more interior holes. Callers can render every polygon
/// or use the first one for a representative shape.
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

    /// Designated initializer used by `LotRepository` when hydrating from the
    /// bundled SQLite database. All fields are already normalized by the
    /// generator, so this init just forwards them.
    init(
        mapId: String,
        active: Bool,
        propertyCode: String,
        propertyName: String,
        shortName: String,
        address: Address,
        location: Coordinate,
        totalSpaces: Int,
        generalAvailable: Int,
        visitor: Int,
        handicapped: Int,
        evCharging: Int,
        fifteenMin: Int,
        foodTruck: Int,
        garage: Bool,
        solar: Bool,
        uncovered: Bool,
        regularGate: Bool,
        smartGate: Bool,
        student: Bool,
        employee: Bool,
        evChargeInfo: String?,
        empHours: String,
        note: String,
        photos: [String],
        polygons: [PolygonRing]
    ) {
        self.id = mapId
        self.mapId = mapId
        self.active = active
        self.propertyCode = propertyCode
        self.propertyName = propertyName
        self.shortName = shortName
        self.address = address
        self.location = location
        self.totalSpaces = totalSpaces
        self.generalAvailable = generalAvailable
        self.visitor = visitor
        self.handicapped = handicapped
        self.evCharging = evCharging
        self.fifteenMin = fifteenMin
        self.foodTruck = foodTruck
        self.garage = garage
        self.solar = solar
        self.uncovered = uncovered
        self.regularGate = regularGate
        self.smartGate = smartGate
        self.student = student
        self.employee = employee
        self.evChargeInfo = evChargeInfo
        self.empHours = empHours
        self.note = note
        self.photos = photos
        self.polygons = polygons
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

    /// True only for structured parking (garage/deck) where a floor/level is meaningful.
    /// Surface lots stay false so we never nag users for a "deck level" everywhere.
    var shouldPromptForDeckLevel: Bool {
        if garage { return true }
        let haystack = (shortName + " " + propertyName).lowercased()
        return haystack.contains("deck")
    }
}

