import Foundation

enum Env {
    static var apiBaseURL: URL {
        configuredURL(for: "API_BASE_URL", fallback: "http://localhost:8000")
    }

    static var apiV1BaseURL: URL {
        let base = apiBaseURL
        let pathParts = base.path
            .split(separator: "/")
            .map { $0.lowercased() }
        if Array(pathParts.suffix(2)) == ["api", "v1"] {
            return base
        }
        return base.appendingPathComponent("api").appendingPathComponent("v1")
    }

    static var supabaseURL: URL {
        configuredURL(for: "SUPABASE_URL", fallback: "https://placeholder.supabase.co")
    }

    static var supabaseAnonKey: String {
        rawValue(for: "SUPABASE_ANON_KEY")
    }

    static var tlsPins: [String] {
        let raw = Bundle.main.object(forInfoDictionaryKey: "TLS_CERT_SHA256") as? String ?? ""
        return raw
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    static var configurationIssues: [String] {
        var issues: [String] = []

        if !isUsableURL(rawValue(for: "API_BASE_URL"), disallowedHosts: ["api.example.com"]) {
            issues.append("API_BASE_URL must point to your FastAPI host.")
        }

        if !isUsableURL(rawValue(for: "SUPABASE_URL"), disallowedHosts: ["example.supabase.co", "placeholder.supabase.co"]) {
            issues.append("SUPABASE_URL must point to your Supabase project.")
        }

        let anonKey = supabaseAnonKey
        if anonKey.isEmpty || anonKey == "release-anon-key" || anonKey == "debug-anon-key" || anonKey == "placeholder" || anonKey.contains("$(") {
            issues.append("SUPABASE_ANON_KEY is missing.")
        }

        return issues
    }

    static var isConfigurationValid: Bool {
        configurationIssues.isEmpty
    }

    private static func rawValue(for key: String) -> String {
        (Bundle.main.object(forInfoDictionaryKey: key) as? String ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func configuredURL(for key: String, fallback: String) -> URL {
        let raw = rawValue(for: key)
        if isUsableURL(raw, disallowedHosts: []), let url = URL(string: raw) {
            return url
        }
        return URL(string: fallback)!
    }

    private static func isUsableURL(_ raw: String, disallowedHosts: Set<String>) -> Bool {
        guard !raw.isEmpty, !raw.contains("$("),
              let url = URL(string: raw),
              let scheme = url.scheme?.lowercased(),
              let host = url.host?.lowercased(),
              ["http", "https"].contains(scheme)
        else {
            return false
        }

        if disallowedHosts.contains(host) { return false }
        if host == "example.com" || host.hasSuffix(".example.com") { return false }
        return true
    }
}
