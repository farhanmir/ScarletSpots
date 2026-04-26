import Foundation

protocol AuthTokenProvider: AnyObject {
    var accessToken: String? { get }
    func refreshSession() async -> Bool
}

enum APIError: LocalizedError {
    case invalidResponse
    case server(status: Int, message: String)
    case unauthorized

    var errorDescription: String? {
        switch self {
        case .invalidResponse: return "Received an invalid response from the server."
        case .unauthorized: return "Your session expired. Please sign in again."
        case .server(_, let message): return message
        }
    }
}

final class APIClient {
    static let shared = APIClient()

    weak var authTokenProvider: AuthTokenProvider?

    /// Shared URLSession with a conservative timeout (so a hung request
    /// doesn't stall the UI forever) and — in release builds with pins
    /// configured — SPKI certificate pinning enforced via
    /// `PinnedURLSessionDelegate`.
    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 20
        config.timeoutIntervalForResource = 45
        config.waitsForConnectivity = false
        config.httpAdditionalHeaders = ["User-Agent": APIClient.userAgent]
        let delegate = PinnedURLSessionDelegate(pins: Env.tlsPins)
        return URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
    }()

    /// Honest User-Agent per API-design guidance:
    /// `ScarletSpots-iOS/<marketing version> (iOS <system version>; <bundle id>)`.
    private static var userAgent: String {
        let info = Bundle.main.infoDictionary ?? [:]
        let version = info["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = info["CFBundleVersion"] as? String ?? "0"
        let bundleId = Bundle.main.bundleIdentifier ?? "com.scarletspots.app"
        let os = ProcessInfo.processInfo.operatingSystemVersion
        let osString = "\(os.majorVersion).\(os.minorVersion).\(os.patchVersion)"
        return "ScarletSpots-iOS/\(version)+\(build) (iOS \(osString); \(bundleId))"
    }

    private init() {}

    func request<T: Decodable>(
        _ path: String,
        method: String = "GET",
        body: Data? = nil,
        requiresAuth: Bool = true,
        idempotencyKey: String? = nil
    ) async throws -> T {
        let data = try await rawRequest(
            path,
            method: method,
            body: body,
            requiresAuth: requiresAuth,
            idempotencyKey: idempotencyKey
        )
        if T.self == EmptyResponse.self, data.isEmpty {
            return EmptyResponse() as! T
        }
        return try JSONDecoder.iso8601.decode(T.self, from: data)
    }

    func rawRequest(
        _ path: String,
        method: String = "GET",
        body: Data? = nil,
        requiresAuth: Bool = true,
        idempotencyKey: String? = nil,
        retryOn401: Bool = true
    ) async throws -> Data {
        let url = try buildURL(path: path)
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        // Only attach the Supabase apikey for calls going through the backend
        // that actually proxy into Supabase — the ScarletSpots FastAPI does not
        // require it. The RN app attaches it only for its `fetchBackend`
        // helper which is what maps to `rawRequest` here.
        if !Env.supabaseAnonKey.isEmpty {
            request.setValue(Env.supabaseAnonKey, forHTTPHeaderField: "apikey")
        }

        // Idempotency key: caller supplies a deterministic value (so queued
        // actions carry the same key across retries). For fresh requests we
        // only add it for writes against park/session-style routes.
        if let idempotencyKey {
            request.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key")
        } else if method != "GET" && path.contains("park/session") {
            request.setValue(UUID().uuidString, forHTTPHeaderField: "Idempotency-Key")
        }

        if requiresAuth, let token = authTokenProvider?.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let attestation = await AttestationService.shared.headers(accessToken: authTokenProvider?.accessToken)
        for (key, value) in attestation {
            request.setValue(value, forHTTPHeaderField: key)
        }

        request.httpBody = body

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if http.statusCode == 401, retryOn401, await authTokenProvider?.refreshSession() == true {
            return try await rawRequest(
                path,
                method: method,
                body: body,
                requiresAuth: requiresAuth,
                idempotencyKey: idempotencyKey,
                retryOn401: false
            )
        }

        guard 200..<300 ~= http.statusCode else {
            if http.statusCode == 401 { throw APIError.unauthorized }
            let message = String(data: data, encoding: .utf8) ?? "Unknown API error"
            throw APIError.server(status: http.statusCode, message: message)
        }

        return data
    }

    // MARK: - URL building

    private func buildURL(path: String) throws -> URL {
        let trimmed = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if let absolute = URL(string: trimmed), absolute.scheme != nil {
            return absolute
        }
        if let idx = trimmed.firstIndex(of: "?") {
            let route = String(trimmed[..<idx])
            let query = String(trimmed[trimmed.index(after: idx)...])
            var components = URLComponents(url: Env.apiV1BaseURL.appendingPathComponent(route), resolvingAgainstBaseURL: false)
            components?.percentEncodedQuery = query
            if let url = components?.url { return url }
        }
        return Env.apiV1BaseURL.appendingPathComponent(trimmed)
    }
}

// MARK: - Decoder helper

struct EmptyResponse: Decodable {}

extension JSONDecoder {
    static var iso8601: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
