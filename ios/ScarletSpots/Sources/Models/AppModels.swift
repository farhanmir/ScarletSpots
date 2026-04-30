import Foundation
import CoreLocation

struct FavoriteLot: Codable, Identifiable {
    let id: String
}

struct OccupancyRow: Codable {
    let lotId: String
    let count: Int?
    let occupancyRate: Double?
    let observedCount: Int?
    let observedOccupancyRate: Double?
    let typicalCount: Int?
    let typicalOccupancyRate: Double?
    let source: String?
    let confidence: String?
    let signalStrength: String?
    let displayMode: String?
    let confidenceInterval: Double?
    let updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case lotId = "lot_id"
        case count
        case occupancyRate = "occupancy_rate"
        case observedCount = "observed_count"
        case observedOccupancyRate = "observed_occupancy_rate"
        case typicalCount = "typical_count"
        case typicalOccupancyRate = "typical_occupancy_rate"
        case source
        case confidence
        case signalStrength = "signal_strength"
        case displayMode = "display_mode"
        case confidenceInterval = "confidence_interval"
        case updatedAt = "updated_at"
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
    struct CurrentSnapshot: Decodable {
        let count: Int?
        let occupancyRate: Double?
        let observedCount: Int?
        let observedOccupancyRate: Double?
        let typicalCount: Int?
        let typicalOccupancyRate: Double?
        let source: String?
        let confidence: String?
        let signalStrength: String?
        let displayMode: String?

        enum CodingKeys: String, CodingKey {
            case count
            case occupancyRate = "occupancy_rate"
            case observedCount = "observed_count"
            case observedOccupancyRate = "observed_occupancy_rate"
            case typicalCount = "typical_count"
            case typicalOccupancyRate = "typical_occupancy_rate"
            case source
            case confidence
            case signalStrength = "signal_strength"
            case displayMode = "display_mode"
        }
    }

    struct Metadata: Decodable {
        let source: String?
        let mode: String?
        let currentSource: String?
        let signalStrength: String?
        let confidence: String?
        let profileType: String?

        enum CodingKeys: String, CodingKey {
            case source
            case mode
            case currentSource = "current_source"
            case signalStrength = "signal_strength"
            case confidence
            case profileType = "profile_type"
        }
    }

    struct ServerPoint: Decodable {
        let time: String
        let expectedOccupancy: Double

        enum CodingKeys: String, CodingKey {
            case time
            case expectedOccupancy = "expected_occupancy"
        }

        var displayLabel: String {
            if let parsed = ISO8601DateFormatter().date(from: time) {
                return DateFormatter.forecastHourMinute.string(from: parsed)
            }
            return time
        }
    }

    let serverPoints: [ServerPoint]
    let metadata: Metadata?
    let current: CurrentSnapshot?

    enum CodingKeys: String, CodingKey {
        case slices
        case curve
        case metadata
        case current
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        metadata = try? container.decode(Metadata.self, forKey: .metadata)
        current = try? container.decode(CurrentSnapshot.self, forKey: .current)
        if let curve = try? container.decode([ServerPoint].self, forKey: .curve), !curve.isEmpty {
            serverPoints = curve
            return
        }
        if let dict = try? container.decode([String: BackendPoint].self, forKey: .slices), !dict.isEmpty {
            let orderedKeys = ["now", "15m", "30m", "60m"]
            serverPoints = orderedKeys.compactMap { key -> ServerPoint? in
                guard let point = dict[key] else { return nil }
                return ServerPoint(time: key, expectedOccupancy: point.expectedOccupancy)
            }
            return
        }
        serverPoints = []
    }
}

extension OccupancyRow {
    var displayRate: Double {
        occupancyRate ?? typicalOccupancyRate ?? observedOccupancyRate ?? 0
    }

    var roundedDisplayPercent: Int {
        Int(min(100, max(0, displayRate)).rounded())
    }

    var isLivePrimary: Bool {
        displayMode == "live" || source == "observed"
    }

    var statusLabel: String {
        if signalStrength == "none", displayRate < 15 {
            return "No live signal"
        }
        if displayRate >= 75 { return "Likely busy" }
        if displayRate >= 45 { return "Moderate" }
        return "Likely open"
    }

    var sourceSummary: String {
        if isLivePrimary { return "Live now" }
        if signalStrength == "sparse" { return "Sparse live signal" }
        return "Typical now"
    }

    var occupancyHeadline: String {
        if isLivePrimary {
            return "\(roundedDisplayPercent)% occupied"
        }
        return "~\(roundedDisplayPercent)% occupied"
    }

    var occupancyDetail: String {
        if isLivePrimary {
            return "Live now"
        }
        if signalStrength == "sparse" {
            return "Estimated from sparse live signal"
        }
        return "Estimated from typical pattern"
    }

    var shortPercentLabel: String {
        isLivePrimary ? "\(roundedDisplayPercent)%" : "~\(roundedDisplayPercent)%"
    }

    var compactSourceLabel: String {
        if isLivePrimary { return "Live" }
        if signalStrength == "sparse" { return "Sparse live" }
        return "Typical"
    }

    var compactStatusLabel: String {
        switch statusLabel {
        case "Likely busy":
            return "Busy"
        case "Likely open":
            return "Open"
        case "No live signal":
            return "No live"
        default:
            return "Moderate"
        }
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

private extension DateFormatter {
    static let forecastHourMinute: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = .current
        formatter.dateFormat = "h:mm a"
        return formatter
    }()
}

struct FriendsListResponse: Codable {
    let friends: [Friendship]
    let requests: [Friendship]
    let blocked: [Friendship]
}

/// Lightweight subset of `/users/me/export` used by Profile UI for aggregate
/// counters without pulling every field into strongly typed models.
struct UserExportResponse: Codable {
    struct SessionSummary: Codable, Identifiable {
        let id: UUID
    }

    let sessions: [SessionSummary]
}

struct ParkingCandidate: Codable, Identifiable {
    let id: UUID
    let lotId: String
    let latitude: Double
    let longitude: Double
    let confidence: Double
    let source: String
    let circlingStartedAt: Date?
    let circlingDurationSeconds: Int?
}

struct SponsorHours: Codable {
    let mon: [String]
    let tue: [String]
    let wed: [String]
    let thu: [String]
    let fri: [String]
    let sat: [String]
    let sun: [String]
}

struct Sponsor: Codable, Identifiable {
    let id: String
    let name: String
    let category: String
    let address: String
    let latitude: Double
    let longitude: Double
    let phone: String
    let websiteURL: String
    let hoursJSON: SponsorHours
    let promoCode: String
    let promoText: String
    let about: String
    let heroPhotoURL: String
    let isActive: Bool
    let billingPlan: String
    let billingStatus: String
    let semesterStart: String
    let semesterEnd: String
    let priorityScore: Int
    let distanceMeters: Double?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case category
        case address
        case latitude
        case longitude
        case phone
        case websiteURL = "website_url"
        case hoursJSON = "hours_json"
        case promoCode = "promo_code"
        case promoText = "promo_text"
        case about
        case heroPhotoURL = "hero_photo_url"
        case isActive = "is_active"
        case billingPlan = "billing_plan"
        case billingStatus = "billing_status"
        case semesterStart = "semester_start"
        case semesterEnd = "semester_end"
        case priorityScore = "priority_score"
        case distanceMeters = "distance_meters"
    }
}

struct SponsorsResponse: Codable {
    let sponsors: [Sponsor]
}

struct SponsorNotificationCandidateResponse: Codable {
    let sponsor: Sponsor?
    let notificationText: String?
    let blockedReason: String?

    enum CodingKeys: String, CodingKey {
        case sponsor
        case notificationText = "notification_text"
        case blockedReason = "blocked_reason"
    }
}

struct SponsorReportEvent: Codable, Identifiable {
    let id = UUID()
    let sponsorId: String
    let eventType: String
    let count: Int

    enum CodingKeys: String, CodingKey {
        case sponsorId = "sponsor_id"
        case eventType = "event_type"
        case count
    }
}

struct SponsorReportResponse: Codable {
    let events: [SponsorReportEvent]
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
