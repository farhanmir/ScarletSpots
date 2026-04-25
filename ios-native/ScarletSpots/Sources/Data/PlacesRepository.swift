import Foundation

/// Matches the schema of `locations.json` — name + address + optional
/// aliases, **no coordinates**. The RN app geocodes these on the fly when
/// the user taps a result; the Swift Search screen does the same via
/// `CLGeocoder`.
struct Place: Codable, Identifiable {
    let id: String
    let name: String
    let address: String
    let campus: String?
    let aliases: String?
}

enum PlacesRepository {
    static func all() -> [Place] {
        guard let url = Bundle.main.url(forResource: "locations", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let places = try? JSONDecoder().decode([Place].self, from: data) else {
            return []
        }
        return places
    }
}
