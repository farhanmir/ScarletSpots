import Foundation
import CoreLocation

struct FavoriteLot: Codable, Identifiable {
    let id: String
}

struct OccupancyRow: Codable {
    let lotId: String
    let count: Int?
    let occupancyRate: Double?
    let source: String?

    enum CodingKeys: String, CodingKey {
        case lotId = "lot_id"
        case count
        case occupancyRate = "occupancy_rate"
        case source
    }
}

struct ForecastPoint: Codable, Identifiable {
    let id = UUID()
    let label: String
    let count: Int
    let occupancyRate: Double?

    enum CodingKeys: String, CodingKey {
        case label
        case count
        case occupancyRate = "occupancy_rate"
    }
}

struct Friendship: Codable, Identifiable {
    let id: UUID
    let friendId: UUID?
    let userId: UUID?
    let name: String
    let status: String
    let parked: Bool?
    let lotId: String?
    let sharingEnabled: Bool?

    enum CodingKeys: String, CodingKey {
        case id
        case friendId = "friend_id"
        case userId = "user_id"
        case name
        case status
        case parked
        case lotId = "lot_id"
        case sharingEnabled = "sharing_enabled"
    }
}

struct ActiveSessionResponse: Codable {
    let session: ParkingSession?
}

struct OccupancyResponse: Codable {
    let occupancy: [OccupancyRow]
}

struct FavoritesResponse: Codable {
    struct FavoriteLotRef: Codable {
        let lotId: String
        enum CodingKeys: String, CodingKey { case lotId = "lot_id" }
    }
    let favoriteLots: [FavoriteLotRef]
    enum CodingKeys: String, CodingKey { case favoriteLots = "favorite_lots" }
}

struct ForecastResponse: Decodable {
    struct Slice: Decodable {
        let label: String
        let count: Int
        let occupancyRate: Double?
        enum CodingKeys: String, CodingKey {
            case label
            case count
            case occupancyRate = "occupancy_rate"
        }
    }

    let slices: [Slice]

    enum CodingKeys: String, CodingKey {
        case slices
        case curve
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        // Primary contract: slices is a dictionary keyed by "now", "15m", "30m", "60m".
        if let dict = try? container.decode([String: BackendPoint].self, forKey: .slices), !dict.isEmpty {
            let orderedKeys = ["now", "15m", "30m", "60m"]
            let ordered = orderedKeys.compactMap { key -> Slice? in
                guard let point = dict[key] else { return nil }
                return Slice(
                    label: key,
                    count: Int(point.expectedOccupancy.rounded()),
                    occupancyRate: point.expectedOccupancy
                )
            }
            if !ordered.isEmpty {
                slices = ordered
                return
            }
        }

        // Fallback contract: curve is an array of points.
        if let curve = try? container.decode([BackendPoint].self, forKey: .curve), !curve.isEmpty {
            slices = curve.prefix(4).enumerated().map { index, point in
                let labels = ["now", "15m", "30m", "60m"]
                let label = index < labels.count ? labels[index] : point.time
                return Slice(
                    label: label,
                    count: Int(point.expectedOccupancy.rounded()),
                    occupancyRate: point.expectedOccupancy
                )
            }
            return
        }

        slices = []
    }
}

private struct BackendPoint: Decodable {
    let time: String
    let expectedOccupancy: Double

    enum CodingKeys: String, CodingKey {
        case time
        case expectedOccupancy = "expected_occupancy"
    }
}

struct FriendsListResponse: Codable {
    let friends: [Friendship]
    let requests: [Friendship]
    let blocked: [Friendship]
}

struct ParkingCandidate: Codable, Identifiable {
    let id: UUID
    let lotId: String
    let latitude: Double
    let longitude: Double
    let confidence: Double
    let source: String
}

struct Building: Codable, Identifiable {
    var id: String { name }
    let name: String
    let latitude: Double
    let longitude: Double
    let address: String
    let campus: String
}

extension CLLocationCoordinate2D {
    func distance(to other: CLLocationCoordinate2D) -> CLLocationDistance {
        CLLocation(latitude: latitude, longitude: longitude)
            .distance(from: CLLocation(latitude: other.latitude, longitude: other.longitude))
    }
}
