import Foundation

@MainActor
final class OfflineCache {
    static let shared = OfflineCache()

    private var ownerId = "anon"
    private init() {}

    func setOwner(_ id: String?) {
        ownerId = id ?? "anon"
    }

    func cacheSession(_ session: ParkingSession?) {
        setObject(session, key: "session")
    }

    func getCachedSession() -> ParkingSession? {
        getObject(key: "session")
    }

    func cacheFavorites(_ favorites: [String]) {
        setObject(favorites, key: "favorites")
    }

    func getCachedFavorites() -> [String] {
        getObject(key: "favorites") ?? []
    }

    func clearAll() {
        UserDefaults.standard.removeObject(forKey: scoped("session"))
        UserDefaults.standard.removeObject(forKey: scoped("favorites"))
    }

    private func scoped(_ key: String) -> String { "\(key):\(ownerId)" }

    private func setObject<T: Codable>(_ value: T?, key: String) {
        guard let value else {
            UserDefaults.standard.removeObject(forKey: scoped(key))
            return
        }
        let encoded = try? JSONEncoder().encode(value)
        UserDefaults.standard.set(encoded, forKey: scoped(key))
    }

    private func getObject<T: Codable>(key: String) -> T? {
        guard let data = UserDefaults.standard.data(forKey: scoped(key)) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
}
