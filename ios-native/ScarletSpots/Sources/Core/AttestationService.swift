import Foundation
import CryptoKit
import UIKit

actor AttestationService {
    static let shared = AttestationService()

    struct AttestationToken: Decodable {
        let token: String
        let expiresInSeconds: Int

        enum CodingKeys: String, CodingKey {
            case token
            case expiresInSeconds = "expires_in_seconds"
        }
    }

    private var cachedToken: String?
    private var expiresAt: Date?
    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 20
        config.timeoutIntervalForResource = 45
        let delegate = PinnedURLSessionDelegate(pins: Env.tlsPins)
        return URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
    }()

    private init() {}

    func headers(accessToken: String?) async -> [String: String] {
        guard let token = try? await getToken(accessToken: accessToken) else {
            return [:]
        }
        return [
            "x-attestation-token": token,
            "x-attestation-platform": "ios"
        ]
    }

    func websocketPayload(accessToken: String?) async -> [String: String] {
        guard let token = try? await getToken(accessToken: accessToken) else {
            return [:]
        }
        return [
            "attestation_token": token,
            "attestation_platform": "ios"
        ]
    }

    private func getToken(accessToken: String?) async throws -> String {
        if let token = cachedToken, let expiresAt, Date() < expiresAt.addingTimeInterval(-30) {
            return token
        }
        guard let accessToken else { throw URLError(.userAuthenticationRequired) }

        let payload: [String: String] = [
            "platform": "ios",
            "device_id": deviceId(),
            "provider": "self_reported"
        ]
        var request = URLRequest(url: Env.apiV1BaseURL.appendingPathComponent("system/attestation/session"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw URLError(.badServerResponse)
        }
        let decoded = try JSONDecoder().decode(AttestationToken.self, from: data)
        cachedToken = decoded.token
        expiresAt = Date().addingTimeInterval(TimeInterval(decoded.expiresInSeconds))
        return decoded.token
    }

    private func deviceId() -> String {
        let base = "ios:\(UIDevice.current.identifierForVendor?.uuidString ?? "scarletspots")"
        let digest = SHA256.hash(data: Data(base.utf8))
        return String(digest.compactMap { String(format: "%02x", $0) }.joined().prefix(40))
    }
}
