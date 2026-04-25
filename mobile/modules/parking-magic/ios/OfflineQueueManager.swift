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
  private let queueStore = DispatchQueue(label: "com.scarletspots.offlinequeue.store")
  private var inFlightEventIds: Set<String> = []
  
  func enqueue(event: PendingEvent) {
    queueStore.sync {
      var events = loadEventsUnsafe()
      if events.contains(where: { $0.id == event.id }) {
        return
      }
      events.append(event)
      saveUnsafe(events: events)
    }
  }
  
  func getAllEvents() -> [PendingEvent] {
    queueStore.sync {
      loadEventsUnsafe()
    }
  }
  
  func clear() {
    queueStore.sync {
      inFlightEventIds.removeAll()
      UserDefaults.standard.removeObject(forKey: queueKey)
    }
  }

  func removeEvent(id: String) {
    queueStore.sync {
      inFlightEventIds.remove(id)
      let events = loadEventsUnsafe().filter { $0.id != id }
      saveUnsafe(events: events)
    }
  }
  
  func flushQueue(onEventFlushed: ((PendingEvent) -> Void)? = nil) {
    let events = queueStore.sync { loadEventsUnsafe() }
    guard !events.isEmpty else { return }
    
    print("[OfflineQueue] Attempting to flush \(events.count) events.")
    
    for event in events {
      let shouldSend = queueStore.sync { () -> Bool in
        if inFlightEventIds.contains(event.id) {
          return false
        }
        inFlightEventIds.insert(event.id)
        return true
      }
      if !shouldSend { continue }

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
          self.queueStore.async {
            self.inFlightEventIds.remove(event.id)
          }
          print("[OfflineQueue] Failed to flush event. Retrying later.")
        }
      }
    }
  }

  private func loadEventsUnsafe() -> [PendingEvent] {
    guard let data = UserDefaults.standard.data(forKey: queueKey),
          let events = try? JSONDecoder().decode([PendingEvent].self, from: data) else {
      return []
    }
    return events
  }

  private func saveUnsafe(events: [PendingEvent]) {
    // Limit queue size to prevent bloat (Phase 8 Hardening)
    let limitedEvents = Array(events.suffix(50))
    if let data = try? JSONEncoder().encode(limitedEvents) {
      UserDefaults.standard.set(data, forKey: queueKey)
    }
  }
}
