import Foundation

struct PendingEvent: Codable {
  let id: String
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

  func removeEvent(id: String) {
    let events = getAllEvents().filter { $0.id != id }
    save(events: events)
  }
  
  func flushQueue(onEventFlushed: ((PendingEvent) -> Void)? = nil) {
    let events = getAllEvents()
    guard !events.isEmpty else { return }
    
    print("[OfflineQueue] Attempting to flush \(events.count) events.")
    
    for event in events {
      NetworkManager.shared.submitParkingEvent(
        lotId: event.lotId ?? "unknown",
        latitude: event.latitude,
        longitude: event.longitude,
        source: event.source
      ) { success, _ in
        if success {
          print("[OfflineQueue] Successfully flushed event \(event.id). Removing from queue.")
          self.removeEvent(id: event.id)
          onEventFlushed?(event)
        } else {
          print("[OfflineQueue] Failed to flush event. Retrying later.")
        }
      }
    }
  }

  private func save(events: [PendingEvent]) {
    // Limit queue size to prevent bloat (Phase 8 Hardening)
    let limitedEvents = Array(events.suffix(50))
    if let data = try? JSONEncoder().encode(limitedEvents) {
      UserDefaults.standard.set(data, forKey: queueKey)
    }
  }
}
