import CoreLocation
import Foundation

/// Shipped elevation bands per lot/level (`Resources/deck_level_bands.json`), produced offline
/// from aggregated session data. Empty file means no suggestions.
enum DeckLevelCalibration {
    private struct RootFile: Decodable {
        let version: Int
        let bandsByLotId: [String: [Band]]
    }

    private struct Band: Decodable {
        let levelKey: String
        let label: String
        let altitudeMinMeters: Double
        let altitudeMaxMeters: Double
        let sampleCount: Int?
    }

    private static let root: RootFile? = {
        guard let url = Bundle.main.url(forResource: "deck_level_bands", withExtension: "json"),
              let data = try? Data(contentsOf: url)
        else { return nil }
        return try? JSONDecoder().decode(RootFile.self, from: data)
    }()

    /// Returns a human label when exactly one bundled band matches the current altitude.
    static func suggestedLabel(lotId: String, location: CLLocation?) -> String? {
        guard let snap = DeckAltitudeGate.snapshot(from: location) else { return nil }
        guard let bands = root?.bandsByLotId[lotId], !bands.isEmpty else { return nil }
        let alt = snap.meters
        let matches = bands.filter { alt >= $0.altitudeMinMeters && alt <= $0.altitudeMaxMeters }
        guard matches.count == 1, let only = matches.first else { return nil }
        if let n = only.sampleCount, n < 20 { return nil }
        return only.label
    }
}
