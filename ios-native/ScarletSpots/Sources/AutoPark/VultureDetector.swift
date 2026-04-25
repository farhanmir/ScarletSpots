import Foundation
import CoreLocation

final class VultureDetector {
    static let shared = VultureDetector()
    private var lotEntryCount: [String: Int] = [:]
    private var lastLotId: String?
    private var entryTime: Date?

    func report(location: CLLocation, lotId: String?) {
        guard let lotId else {
            lastLotId = nil
            entryTime = nil
            return
        }
        if lotId != lastLotId {
            if let lastLotId { lotEntryCount[lastLotId] = nil }
            lastLotId = lotId
            entryTime = Date()
            lotEntryCount[lotId, default: 0] += 1
        }

        let circling = lotEntryCount[lotId, default: 0] >= 3
        let dwelling = (entryTime != nil) && Date().timeIntervalSince(entryTime!) > 120
        if circling || dwelling {
            NotificationCenter.default.post(name: .vultureDetected, object: nil, userInfo: ["lotId": lotId])
            lotEntryCount[lotId] = 0
        }
    }
}

extension Notification.Name {
    static let vultureDetected = Notification.Name("com.scarletspots.vulture_detected")
}
