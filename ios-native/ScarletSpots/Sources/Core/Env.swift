import Foundation

enum Env {
    static var apiBaseURL: URL {
        let value = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String ?? ""
        return URL(string: value) ?? URL(string: "http://localhost:8000")!
    }

    static var apiV1BaseURL: URL {
        apiBaseURL.appendingPathComponent("api").appendingPathComponent("v1")
    }

    static var supabaseURL: URL {
        let value = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String ?? ""
        return URL(string: value) ?? URL(string: "https://example.supabase.co")!
    }

    static var supabaseAnonKey: String {
        Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String ?? ""
    }

    static var tlsPins: [String] {
        let raw = Bundle.main.object(forInfoDictionaryKey: "TLS_CERT_SHA256") as? String ?? ""
        return raw
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }
}
