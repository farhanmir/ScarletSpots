import Foundation

struct PendingEvent: Codable {
  let id: String
  let ownerId: String?
  let latitude: Double
  let longitude: Double
  let source: String
  let timestamp: Double
  let lotId: String?
  let idempotencyKey: String?
}

class OfflineQueueManager {
  static let shared = OfflineQueueManager()
  private let queueKey = "com.scarletspots.pending_events"
  private let queueStore = DispatchQueue(label: "com.scarletspots.offlinequeue.store")
  private var inFlightEventIds: Set<String> = []
  private var ownerId: String?

  func configureOwner(_ ownerId: String?) {
    queueStore.sync {
      self.ownerId = ownerId
      inFlightEventIds.removeAll()
    }
  }
  
  func enqueue(event: PendingEvent) {
    queueStore.sync {
      var events = loadEventsUnsafe()
      if events.contains(where: { $0.id == event.id }) {
        return
      }
      let normalized = PendingEvent(
        id: event.id,
        ownerId: event.ownerId ?? ownerId,
        latitude: event.latitude,
        longitude: event.longitude,
        source: event.source,
        timestamp: event.timestamp,
        lotId: event.lotId,
        idempotencyKey: event.idempotencyKey
      )
      events.append(normalized)
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
    let events = queueStore.sync {
      let all = loadEventsUnsafe()
      guard let ownerId else { return all }
      return all.filter { $0.ownerId == nil || $0.ownerId == ownerId }
    }
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
        source: event.source,
        idempotencyKey: event.idempotencyKey
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
