import Foundation
import CoreLocation

class VultureManager {
  static let shared = VultureManager()
  
  private var lotEntryCount: [String: Int] = [:]
  private var lastLotId: String?
  private var entryTime: Date?
  
  func reportLocation(location: CLLocation, lotId: String?) {
    guard let lotId = lotId else {
      lastLotId = nil
      entryTime = nil
      return
    }
    
    if lotId != lastLotId {
      lastLotId = lotId
      entryTime = Date()
      lotEntryCount[lotId, default: 0] += 1
    }
    
    // Vulture Logic: If circling (entry count > 2) or dwelling (> 2 mins)
    let isCircling = lotEntryCount[lotId, default: 0] >= 3
    let isDwelling = entryTime != nil && Date().timeIntervalSince(entryTime!) > 120
    
    if isCircling || isDwelling {
      // Possible Vulture detected
      NotificationCenter.default.post(name: .vultureDetected, object: nil, userInfo: ["lotId": lotId])
    }
  }
}

extension Notification.Name {
  static let vultureDetected = Notification.Name("com.scarletspots.vulture_detected")
}
