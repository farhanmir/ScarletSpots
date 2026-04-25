import Foundation

enum UsersAPI {
    static func me() async throws -> Profile {
        try await APIClient.shared.request("users/me")
    }

    /// Permanently deletes the current user's account and all server-side
    /// data. Required by App Store Review Guideline 5.1.1(v) for any app
    /// that allows account creation.
    static func deleteAccount() async throws {
        _ = try await APIClient.shared.rawRequest("users/me", method: "DELETE")
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
        return response.slices.map { slice in
            let percent = slice.occupancyRate ?? Double(slice.count)
            let expectedCount = Int((Double(capacity) * percent / 100.0).rounded())
            return ForecastPoint(
                label: slice.label,
                count: max(0, min(capacity, expectedCount)),
                occupancyRate: percent
            )
        }
    }
}

enum ParkAPI {
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
        let body = try JSONSerialization.data(withJSONObject: payload)
        _ = try await APIClient.shared.rawRequest(
            "park/session",
            method: "POST",
            body: body,
            idempotencyKey: idempotencyKey
        )
    }

    static func endSession(idempotencyKey: String? = nil) async throws {
        _ = try await APIClient.shared.rawRequest(
            "park/session/end",
            method: "POST",
            idempotencyKey: idempotencyKey
        )
    }

    static func sendFeedback(sessionId: UUID, rating: Int, notes: String?) async throws {
        var payload: [String: Any] = [
            "session_id": sessionId.uuidString,
            "rating": rating
        ]
        if let notes, !notes.isEmpty { payload["notes"] = notes }
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
