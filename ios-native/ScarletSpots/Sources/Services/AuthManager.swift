import Combine
import Foundation
import Supabase

@MainActor
final class AuthManager: ObservableObject, AuthTokenProvider {
    static let shared = AuthManager()

    let client: SupabaseClient

    @Published private(set) var isAuthenticated = false
    @Published private(set) var currentUser: Profile?
    @Published private(set) var session: Session?
    @Published private(set) var permitType: String?
    @Published private(set) var secondaryPermitType: String?
    @Published private(set) var noPermitMode: String?

    /// Raw set of enabled campus toggles as the user sees them. This is the
    /// same set the RN app uses in AsyncStorage ("Cook/Douglass" may be stored
    /// as a single toggle; LotRepository.expandCampusNames normalizes it
    /// to individual campus labels for lot filtering).
    @Published private(set) var enabledCampuses: Set<String>

    var accessToken: String? { session?.accessToken }

    /// Stable string id for the signed-in user, or "anon" if signed out.
    /// Used by caches / offline queue / push registration to key per-user data.
    var ownerId: String { session?.user.id.uuidString ?? "anon" }

    // MARK: - Storage keys

    private enum Keys {
        static let enabledCampuses = "enabled_campuses_v1"
        static let secondaryPermitPrefix = "secondary_permit_v1"
        static let permitTypePrefix = "permit_type_v1"
        static let noPermitModePrefix = "no_permit_mode_v1"
    }

    private init() {
        client = SupabaseClient(supabaseURL: Env.supabaseURL, supabaseKey: Env.supabaseAnonKey)
        self.enabledCampuses = Self.loadEnabledCampuses()
        self.noPermitMode = loadLocalNoPermitMode(ownerId: nil)
        APIClient.shared.authTokenProvider = self

        guard Env.isConfigurationValid else {
            Logger.log("Native iOS config missing: \(Env.configurationIssues.joined(separator: " "))")
            return
        }

        Task { await checkSession() }
        Task {
            for await (_, newSession) in client.auth.authStateChanges {
                await handleSessionChange(newSession)
            }
        }
    }

    // MARK: - Session lifecycle

    func checkSession() async {
        do {
            let current = try await client.auth.session
            await handleSessionChange(current)
        } catch {
            await handleSessionChange(nil)
        }
    }

    func refreshSession() async -> Bool {
        do {
            let refreshed = try await client.auth.refreshSession()
            await handleSessionChange(refreshed)
            return true
        } catch {
            Logger.log("Auth refresh failed: \(error.localizedDescription)")
            return false
        }
    }

    func signIn(email: String, password: String) async throws {
        _ = try await client.auth.signIn(email: email, password: password)
        await checkSession()
    }

    func signUp(email: String, password: String, firstName: String, lastName: String) async throws {
        let mergedName = "\(firstName) \(lastName)".trimmingCharacters(in: .whitespacesAndNewlines)
        let payload: [String: Any] = [
            "email": email,
            "password": password,
            "name": mergedName
        ]
        let body = try JSONSerialization.data(withJSONObject: payload)
        _ = try await APIClient.shared.rawRequest("users/signup", method: "POST", body: body, requiresAuth: false)
        try await signIn(email: email, password: password)
    }

    func sendPasswordReset(email: String) async throws {
        let payload = try JSONSerialization.data(withJSONObject: ["email": email])
        _ = try await APIClient.shared.rawRequest("users/password-reset", method: "POST", body: payload, requiresAuth: false)
    }

    /// Permanently deletes the current user's account. Server-side data is
    /// removed by the backend; we then clear local caches and sign out. If
    /// the server call fails we do NOT sign the user out — they should see
    /// the error and retry rather than end up locally signed-out but still
    /// registered on the server.
    func deleteAccount() async throws {
        try await UsersAPI.deleteAccount()
        await PushRegistration.shared.clearOnSignOut()
        await signOut()
    }

    func signOut() async {
        let previousOwner = session?.user.id.uuidString

        do {
            try await client.auth.signOut()
        } catch {
            Logger.log("Auth signOut error: \(error.localizedDescription)")
        }

        // Clear caches BEFORE we flip the owner so the previous user's data is
        // what actually gets wiped.
        if let previousOwner {
            OfflineCache.shared.setOwner(previousOwner)
            OfflineCache.shared.clearAll()
            await OfflineQueue.shared.setOwner(previousOwner)
            await OfflineQueue.shared.clearQueue()
        }

        isAuthenticated = false
        session = nil
        currentUser = nil
        permitType = nil
        secondaryPermitType = nil
        noPermitMode = nil

        OfflineCache.shared.setOwner(nil)
        await OfflineQueue.shared.setOwner(nil)
    }

    // MARK: - Profile

    func fetchProfile() async {
        guard isAuthenticated, let ownerId = session?.user.id.uuidString else { return }
        do {
            let profile: Profile = try await APIClient.shared.request("users/me")
            currentUser = profile
            permitType = profile.permitType ?? loadLocalPermitType(ownerId: ownerId)
            secondaryPermitType = profile.secondaryPermitType
                ?? loadLocalSecondaryPermit(ownerId: ownerId)
        } catch {
            Logger.log("Failed to fetch /users/me: \(error.localizedDescription)")
            permitType = loadLocalPermitType(ownerId: ownerId)
            secondaryPermitType = loadLocalSecondaryPermit(ownerId: ownerId)
        }
    }

    func setPermitPreference(primary: String?, secondary: String?) async {
        permitType = primary
        secondaryPermitType = secondary

        let ownerId = session?.user.id.uuidString
        saveLocalPermitType(primary, ownerId: ownerId)
        saveLocalSecondaryPermit(secondary, ownerId: ownerId)

        // Guard against nil first/last names — JSONSerialization fails if `Any`
        // is `nil`. Only include keys with concrete values.
        var payload: [String: Any] = [:]
        if let primary { payload["permit_type"] = primary } else { payload["permit_type"] = NSNull() }
        if let first = currentUser?.firstName { payload["first_name"] = first }
        if let last = currentUser?.lastName { payload["last_name"] = last }

        if let data = try? JSONSerialization.data(withJSONObject: payload, options: []) {
            _ = try? await APIClient.shared.rawRequest("users/me", method: "PATCH", body: data)
        }
    }

    func setNoPermitMode(_ mode: String?) {
        noPermitMode = mode
        saveLocalNoPermitMode(mode, ownerId: ownerId)
    }

    // MARK: - Campus toggles

    func toggleCampus(_ campus: String) {
        if enabledCampuses.contains(campus) {
            enabledCampuses.remove(campus)
        } else {
            enabledCampuses.insert(campus)
        }
        persistEnabledCampuses()
    }

    func setEnabledCampuses(_ campuses: Set<String>) {
        enabledCampuses = campuses
        persistEnabledCampuses()
    }

    // MARK: - Internal

    private func handleSessionChange(_ newSession: Session?) async {
        session = newSession
        isAuthenticated = newSession != nil

        let owner = newSession?.user.id.uuidString
        OfflineCache.shared.setOwner(owner)
        await OfflineQueue.shared.setOwner(owner)

        if isAuthenticated {
            permitType = loadLocalPermitType(ownerId: owner)
            secondaryPermitType = loadLocalSecondaryPermit(ownerId: owner)
            noPermitMode = loadLocalNoPermitMode(ownerId: owner)
            await fetchProfile()
        } else {
            currentUser = nil
            permitType = nil
            secondaryPermitType = nil
            noPermitMode = nil
        }
    }

    // MARK: - Persistence helpers

    private func persistEnabledCampuses() {
        UserDefaults.standard.set(Array(enabledCampuses), forKey: Keys.enabledCampuses)
    }

    private static func loadEnabledCampuses() -> Set<String> {
        if let stored = UserDefaults.standard.stringArray(forKey: Keys.enabledCampuses) {
            return Set(stored)
        }
        return Set(CampusConstants.newBrunswickCampusNames)
    }

    private func secondaryPermitKey(ownerId: String?) -> String {
        "\(Keys.secondaryPermitPrefix):\(ownerId ?? "anon")"
    }

    private func permitTypeKey(ownerId: String?) -> String {
        "\(Keys.permitTypePrefix):\(ownerId ?? "anon")"
    }

    private func saveLocalSecondaryPermit(_ permit: String?, ownerId: String?) {
        let key = secondaryPermitKey(ownerId: ownerId)
        if let permit { UserDefaults.standard.set(permit, forKey: key) }
        else { UserDefaults.standard.removeObject(forKey: key) }
    }

    private func loadLocalSecondaryPermit(ownerId: String?) -> String? {
        UserDefaults.standard.string(forKey: secondaryPermitKey(ownerId: ownerId))
    }

    private func saveLocalPermitType(_ permit: String?, ownerId: String?) {
        let key = permitTypeKey(ownerId: ownerId)
        if let permit { UserDefaults.standard.set(permit, forKey: key) }
        else { UserDefaults.standard.removeObject(forKey: key) }
    }

    private func loadLocalPermitType(ownerId: String?) -> String? {
        UserDefaults.standard.string(forKey: permitTypeKey(ownerId: ownerId))
    }

    private func noPermitModeKey(ownerId: String?) -> String {
        "\(Keys.noPermitModePrefix):\(ownerId ?? "anon")"
    }

    private func saveLocalNoPermitMode(_ mode: String?, ownerId: String?) {
        let key = noPermitModeKey(ownerId: ownerId)
        if let mode { UserDefaults.standard.set(mode, forKey: key) }
        else { UserDefaults.standard.removeObject(forKey: key) }
    }

    private func loadLocalNoPermitMode(ownerId: String?) -> String? {
        UserDefaults.standard.string(forKey: noPermitModeKey(ownerId: ownerId))
    }
}
