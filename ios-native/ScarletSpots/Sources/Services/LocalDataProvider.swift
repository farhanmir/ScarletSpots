import Foundation

@MainActor
final class LocalDataProvider {
    static let shared = LocalDataProvider()

    private(set) var lots: [Lot] = []

    private init() {
        lots = LotRepository.shared.lots
    }

    func lot(with mapId: String) -> Lot? {
        LotRepository.shared.byId(mapId)
    }

    func lots(for campus: String) -> [Lot] {
        LotRepository.shared.lots.filter { $0.address.campus?.lowercased() == campus.lowercased() }
    }
}
