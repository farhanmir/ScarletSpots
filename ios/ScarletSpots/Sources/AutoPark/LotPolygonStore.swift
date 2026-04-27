import Foundation
import CoreLocation

enum LotPolygonStore {
    @MainActor
    static func lot(at coordinate: CLLocationCoordinate2D) -> Lot? {
        LotRepository.shared.lotContaining(coordinate)
    }
}
