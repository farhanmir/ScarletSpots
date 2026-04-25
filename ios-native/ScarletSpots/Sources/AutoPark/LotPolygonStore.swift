import Foundation
import CoreLocation

enum LotPolygonStore {
    static func lot(at coordinate: CLLocationCoordinate2D) -> Lot? {
        LotRepository.shared.lotContaining(coordinate)
    }
}
