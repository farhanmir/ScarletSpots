import CoreLocation
import Foundation

enum DeckAltitudeGate {
    /// Above this, GPS altitude is too noisy to store or use for deck inference.
    static let maxVerticalAccuracyMeters: Double = 45

    static func snapshot(from location: CLLocation?) -> (meters: Double, accuracy: Double)? {
        guard let location else { return nil }
        let acc = location.verticalAccuracy
        guard acc > 0, acc <= maxVerticalAccuracyMeters else { return nil }
        return (location.altitude, acc)
    }
}

enum DeckLevelNormalizer {
    /// Canonical key for aggregation (uppercased, strips a leading "LEVEL " prefix).
    static func normalizedKey(from userLabel: String) -> String {
        var s = userLabel.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if s.hasPrefix("LEVEL ") {
            s = String(s.dropFirst(6)).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return s
    }
}
