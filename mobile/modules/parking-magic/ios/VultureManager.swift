import Foundation
import CoreLocation

class VultureManager {
  static let shared = VultureManager()
  
  private var lotEntryCount: [String: Int] = [:]
  private var lastLotId: String?
  private var entryTime: Date?
  
  func reportLocation(location: CLLocation, lotId: String?) {
    // If we've moved significantly (>200m) from the last known lot, clear counts
    if let lastId = lastLotId, lotId == nil {
      // Logic for "Leaving Lot" detection could be added here
    }

    guard let lotId = lotId else {
      lastLotId = nil
      entryTime = nil
      return
    }
    
    // Auto-prune old data if we switch lots
    if lotId != lastLotId {
      if let last = lastLotId {
        lotEntryCount.removeValue(forKey: last)
      }
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
      
      // Reset count after firing to prevent spam
      lotEntryCount[lotId] = 0
    }
  }

  func reset() {
    lotEntryCount.removeAll()
    lastLotId = nil
    entryTime = nil
    print("[VultureManager] Reset state.")
  }
}

extension Notification.Name {
  static let vultureDetected = Notification.Name("com.scarletspots.vulture_detected")
}
