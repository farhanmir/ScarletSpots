import Foundation

struct PendingEvent: Codable {
  let latitude: Double
  let longitude: Double
  let source: String
  let timestamp: Double
  let lotId: String?
}

class OfflineQueueManager {
  static let shared = OfflineQueueManager()
  private let queueKey = "com.scarletspots.pending_events"
  
  func enqueue(event: PendingEvent) {
    var events = getAllEvents()
    events.append(event)
    save(events: events)
  }
  
  func getAllEvents() -> [PendingEvent] {
    guard let data = UserDefaults.standard.data(forKey: queueKey),
          let events = try? JSONDecoder().decode([PendingEvent].self, from: data) else {
      return []
    }
    return events
  }
  
  func clear() {
    UserDefaults.standard.removeObject(forKey: queueKey)
  }
  
  func flushQueue() {
    let events = getAllEvents()
    guard !events.isEmpty else { return }
    
    print("[OfflineQueue] Attempting to flush \(events.count) events.")
    
    // Process one by one (simplified)
    for event in events {
      NetworkManager.shared.submitParkingEvent(
        lotId: event.lotId ?? "unknown",
        latitude: event.latitude,
        longitude: event.longitude,
        source: event.source
      ) { success in
        if success {
          // In a real implementation, we'd remove only this specific event
        }
      }
    }
    
    // Clear for now (Simplified for Phase 8)
    clear()
  }

  private func save(events: [PendingEvent]) {
    if let data = try? JSONEncoder().encode(events) {
      UserDefaults.standard.set(data, forKey: queueKey)
    }
  }
}
