import Foundation

enum BuildingRepository {
    static func all() -> [Building] {
        guard let url = Bundle.main.url(forResource: "buildings", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let buildings = try? JSONDecoder().decode([Building].self, from: data) else {
            return []
        }
        return buildings
    }
}
