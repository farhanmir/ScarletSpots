import Foundation

enum FeatureFlags {
    static let enableAllCampuses = ProcessInfo.processInfo.environment["ENABLE_ALL_CAMPUSES"] == "true"
    static let showAutoParkSimulator = ProcessInfo.processInfo.environment["SHOW_AUTOPARK_SIMULATOR"] == "true"
}
