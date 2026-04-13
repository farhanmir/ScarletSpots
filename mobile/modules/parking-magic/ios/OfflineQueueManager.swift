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
  
  private func save(events: [PendingEvent]) {
    if let data = try? JSONEncoder().encode(events) {
      UserDefaults.standard.set(data, forKey: queueKey)
    }
  }
}
