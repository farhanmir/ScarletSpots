import Foundation

struct ParkingSession: Codable, Identifiable {
    let id: UUID
    let lotId: String
    let latitude: Double?
    let longitude: Double?
    let startTime: Date
    let endTime: Date?
    let active: Bool
    let autoStarted: Bool
    let startSource: String?
    let endSource: String?
    let circlingStartedAt: Date?
    let circlingDurationSeconds: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case lotId = "lot_id"
        case lotIdCamel = "lotId"
        case latitude
        case longitude
        case startTime = "start_time"
        case startTimeCamel = "startTime"
        case endTime = "end_time"
        case active
        case autoStarted = "auto_started"
        case autoStartedCamel = "autoStarted"
        case startSource = "start_source"
        case startSourceCamel = "startSource"
        case endSource = "end_source"
        case endSourceCamel = "endSource"
        case circlingStartedAt = "circling_started_at"
        case circlingStartedAtCamel = "circlingStartedAt"
        case circlingDurationSeconds = "circling_duration_seconds"
        case circlingDurationSecondsCamel = "circlingDurationSeconds"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        lotId = try c.decodeIfPresent(String.self, forKey: .lotIdCamel)
            ?? c.decodeIfPresent(String.self, forKey: .lotId)
            ?? ""
        latitude = try c.decodeIfPresent(Double.self, forKey: .latitude)
        longitude = try c.decodeIfPresent(Double.self, forKey: .longitude)
        startTime = try c.decodeIfPresent(Date.self, forKey: .startTimeCamel)
            ?? c.decodeIfPresent(Date.self, forKey: .startTime)
            ?? Date()
        endTime = try c.decodeIfPresent(Date.self, forKey: .endTime)
        active = try c.decodeIfPresent(Bool.self, forKey: .active) ?? false
        autoStarted = try c.decodeIfPresent(Bool.self, forKey: .autoStartedCamel)
            ?? c.decodeIfPresent(Bool.self, forKey: .autoStarted)
            ?? false
        startSource = try c.decodeIfPresent(String.self, forKey: .startSourceCamel)
            ?? c.decodeIfPresent(String.self, forKey: .startSource)
        endSource = try c.decodeIfPresent(String.self, forKey: .endSourceCamel)
            ?? c.decodeIfPresent(String.self, forKey: .endSource)
        circlingStartedAt = try c.decodeIfPresent(Date.self, forKey: .circlingStartedAtCamel)
            ?? c.decodeIfPresent(Date.self, forKey: .circlingStartedAt)
        circlingDurationSeconds = try c.decodeIfPresent(Int.self, forKey: .circlingDurationSecondsCamel)
            ?? c.decodeIfPresent(Int.self, forKey: .circlingDurationSeconds)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(lotId, forKey: .lotId)
        try c.encodeIfPresent(latitude, forKey: .latitude)
        try c.encodeIfPresent(longitude, forKey: .longitude)
        try c.encode(startTime, forKey: .startTime)
        try c.encodeIfPresent(endTime, forKey: .endTime)
        try c.encode(active, forKey: .active)
        try c.encode(autoStarted, forKey: .autoStarted)
        try c.encodeIfPresent(startSource, forKey: .startSource)
        try c.encodeIfPresent(endSource, forKey: .endSource)
        try c.encodeIfPresent(circlingStartedAt, forKey: .circlingStartedAt)
        try c.encodeIfPresent(circlingDurationSeconds, forKey: .circlingDurationSeconds)
    }
}
