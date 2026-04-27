import Foundation

enum UsersAPI {
    static func me() async throws -> Profile {
        try await APIClient.shared.request("users/me")
    }

    static func exportData() async throws -> UserExportResponse {
        try await APIClient.shared.request("users/me/export")
    }

    /// Permanently deletes the current user's account and all server-side
    /// data. Required by App Store Review Guideline 5.1.1(v) for any app
    /// that allows account creation.
    static func deleteAccount() async throws -> AccountDeletionResponse {
        let body = try JSONSerialization.data(withJSONObject: ["confirm": true])
        return try await APIClient.shared.request(
            "users/me",
            method: "DELETE",
            body: body
        )
    }
}

enum LotsAPI {
    static func occupancy() async throws -> [OccupancyRow] {
        let response: OccupancyResponse = try await APIClient.shared.request("lots/occupancy")
        return response.occupancy
    }

    static func forecast(lotId: String, capacity: Int, currentOccupancy: Int) async throws -> [ForecastPoint] {
        let path = "lots/\(lotId)/forecast?capacity=\(capacity)&current_occupancy=\(currentOccupancy)"
        let response: ForecastResponse = try await APIClient.shared.request(path)
        return response.serverPoints.map { point in
            let expectedCount = Int((Double(capacity) * point.expectedOccupancy / 100.0).rounded())
            return ForecastPoint(
                label: point.displayLabel,
                count: max(0, min(capacity, expectedCount)),
                occupancyRate: point.expectedOccupancy
            )
        }
    }
}

enum ParkAPI {
    static func feedbackPayload(sessionId: UUID, lotId: String, rating: Int, notes: String?) -> [String: Any] {
        let quality: String
        switch rating {
        case 5: quality = "correct"
        case 3...4: quality = "wrong_lot"
        case 2: quality = "missed"
        default: quality = "false_positive"
        }
        var payload: [String: Any] = [
            "session_id": sessionId.uuidString,
            "lot_id": lotId,
            "quality": quality
        ]
        if let notes, !notes.isEmpty { payload["notes"] = notes }
        return payload
    }

    static func activeSession() async throws -> ParkingSession? {
        let envelope: ActiveSessionResponse = try await APIClient.shared.request("park/session/active")
        return envelope.session
    }

    /// Starts a parking session. Callers can optionally provide an
    /// `idempotencyKey` to dedupe retries (strongly recommended on the
    /// auto-park path so backgrounded retries don't create duplicate sessions).
    static func startSession(
        lotId: String,
        latitude: Double,
        longitude: Double,
        autoStarted: Bool = false,
        source: String? = nil,
        circlingStartedAt: Date? = nil,
        circlingDurationSeconds: Int? = nil,
        idempotencyKey: String? = nil
    ) async throws {
        var payload: [String: Any] = [
            "lotId": lotId,
            "latitude": latitude,
            "longitude": longitude,
            "confirmed": true,
            "autoStarted": autoStarted
        ]
        if let source { payload["source"] = source }
        if let circlingStartedAt {
            payload["circling_started_at"] = ISO8601DateFormatter().string(from: circlingStartedAt)
        }
        if let circlingDurationSeconds {
            payload["circling_duration_seconds"] = circlingDurationSeconds
        }
        let body = try JSONSerialization.data(withJSONObject: payload)
        _ = try await APIClient.shared.rawRequest(
            "park/session",
            method: "POST",
            body: body,
            idempotencyKey: idempotencyKey
        )
    }

    static func endSession(idempotencyKey: String? = nil) async throws {
        try await endSession(source: nil, idempotencyKey: idempotencyKey)
    }

    static func endSession(source: String?, idempotencyKey: String? = nil) async throws {
        let body: Data?
        if let source {
            body = try JSONSerialization.data(withJSONObject: ["source": source])
        } else {
            body = nil
        }
        _ = try await APIClient.shared.rawRequest(
            "park/session/end",
            method: "POST",
            body: body,
            idempotencyKey: idempotencyKey
        )
    }

    static func sendFeedback(sessionId: UUID, lotId: String, rating: Int, notes: String?) async throws {
        let payload = feedbackPayload(sessionId: sessionId, lotId: lotId, rating: rating, notes: notes)
        let body = try JSONSerialization.data(withJSONObject: payload)
        _ = try await APIClient.shared.rawRequest("park/session/feedback", method: "POST", body: body)
    }
}

enum FavoritesAPI {
    static func list() async throws -> [String] {
        let response: FavoritesResponse = try await APIClient.shared.request("favorites")
        return response.favoriteLots.map(\.lotId)
    }

    static func add(lotId: String) async throws {
        _ = try await APIClient.shared.rawRequest("favorites/\(lotId)", method: "POST")
    }

    static func remove(lotId: String) async throws {
        _ = try await APIClient.shared.rawRequest("favorites/\(lotId)", method: "DELETE")
    }
}

enum FriendsAPI {
    static func list() async throws -> FriendsListResponse {
        try await APIClient.shared.request("friends")
    }
    static func request(email: String) async throws {
        let body = try JSONSerialization.data(withJSONObject: ["friend_email": email])
        _ = try await APIClient.shared.rawRequest("friends/request", method: "POST", body: body)
    }
    static func accept(_ requestId: UUID) async throws {
        let body = try JSONSerialization.data(withJSONObject: ["request_id": requestId.uuidString])
        _ = try await APIClient.shared.rawRequest("friends/accept", method: "POST", body: body)
    }
    static func decline(_ requestId: UUID) async throws {
        let body = try JSONSerialization.data(withJSONObject: ["request_id": requestId.uuidString])
        _ = try await APIClient.shared.rawRequest("friends/decline", method: "POST", body: body)
    }
    static func block(_ userId: UUID) async throws {
        let body = try JSONSerialization.data(withJSONObject: ["user_id": userId.uuidString])
        _ = try await APIClient.shared.rawRequest("friends/block", method: "POST", body: body)
    }
    static func unblock(_ userId: UUID) async throws {
        let body = try JSONSerialization.data(withJSONObject: ["user_id": userId.uuidString])
        _ = try await APIClient.shared.rawRequest("friends/unblock", method: "POST", body: body)
    }
    static func setSharing(_ friendshipId: UUID, enabled: Bool) async throws {
        let body = try JSONSerialization.data(withJSONObject: ["enabled": enabled])
        _ = try await APIClient.shared.rawRequest("friends/\(friendshipId.uuidString)/sharing", method: "PUT", body: body)
    }
}

struct AccountDeletionResponse: Codable {
    let success: Bool
    let authDeleted: Bool

    enum CodingKeys: String, CodingKey {
        case success
        case authDeleted = "auth_deleted"
    }
}
