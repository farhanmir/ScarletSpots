import Foundation

enum NetworkBridge {
    static func startSession(
        lotId: String,
        latitude: Double,
        longitude: Double,
        autoStarted: Bool,
        source: String?,
        idempotencyKey: String? = nil
    ) async throws {
        try await ParkAPI.startSession(
            lotId: lotId,
            latitude: latitude,
            longitude: longitude,
            autoStarted: autoStarted,
            source: source,
            idempotencyKey: idempotencyKey
        )
    }

    static func endSession(
        source: String?,
        idempotencyKey: String? = nil
    ) async throws {
        try await ParkAPI.endSession(source: source, idempotencyKey: idempotencyKey)
    }
}
