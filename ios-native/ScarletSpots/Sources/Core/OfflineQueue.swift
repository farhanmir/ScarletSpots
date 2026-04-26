import Foundation
import Network

/// A single action waiting to be replayed against the backend.
///
/// The `idempotencyKey` is generated ONCE at enqueue time so any subsequent
/// retry carries the same `Idempotency-Key` header — this is what lets the
/// backend dedupe a parking start the user triggered in airplane mode from
/// the same start once the phone reconnects.
struct QueuedAction: Codable, Identifiable {
    let id: UUID
    let ownerId: String
    let type: String
    let endpoint: String
    let method: String
    let payload: Data?
    let idempotencyKey: String?
    var attempts: Int
    let queuedAt: Date
}

@MainActor
final class OfflineQueue: ObservableObject {
    static let shared = OfflineQueue()

    @Published private(set) var pendingCount = 0
    @Published private(set) var pendingTypes: [String] = []
    @Published private(set) var pendingEndpoints: [String] = []
    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "com.scarletspots.offline.monitor")
    private var ownerId: String = "anon"
    private var isFlushing = false
    private let storageKeyPrefix = "offline_queue_v1"
    private let maxAttempts = 5

    private init() {}

    // MARK: - Lifecycle

    func start() {
        monitor.pathUpdateHandler = { [weak self] path in
            guard path.status == .satisfied else { return }
            Task { @MainActor in await self?.flush() }
        }
        monitor.start(queue: monitorQueue)
        refreshCount()
    }

    func stop() {
        monitor.cancel()
    }

    func setOwner(_ id: String?) async {
        ownerId = id ?? "anon"
        refreshCount()
    }

    // MARK: - Queue mutations

    func enqueue(
        type: String,
        endpoint: String,
        method: String = "POST",
        payload: Data?,
        idempotencyKey: String? = nil
    ) async {
        var actions = load()
        let key = idempotencyKey ?? Self.generateIdempotencyKey(prefix: type)
        let action = QueuedAction(
            id: UUID(),
            ownerId: ownerId,
            type: type,
            endpoint: endpoint,
            method: method,
            payload: payload,
            idempotencyKey: key,
            attempts: 0,
            queuedAt: Date()
        )
        actions.append(action)
        save(actions)
        publishQueueState(actions)
        Logger.log("OfflineQueue: enqueued \(type) (\(action.id)) depth=\(actions.count)")
    }

    func flush() async {
        guard !isFlushing else { return }
        isFlushing = true
        defer { isFlushing = false }

        var actions = load()
        guard !actions.isEmpty else { return }

        var remaining: [QueuedAction] = []
        for var action in actions {
            // Cross-owner safety: an action queued while signed in as user A
            // should never be replayed while signed in as user B. Keep it
            // around in case user A signs back in later.
            if action.ownerId != ownerId {
                remaining.append(action)
                continue
            }

            if action.attempts >= maxAttempts {
                Logger.log("OfflineQueue: dropping stale \(action.type) (\(action.id))")
                continue
            }

            do {
                _ = try await APIClient.shared.rawRequest(
                    action.endpoint,
                    method: action.method,
                    body: action.payload,
                    idempotencyKey: action.idempotencyKey
                )
                Logger.log("OfflineQueue: flushed \(action.type) (\(action.id))")
            } catch {
                action.attempts += 1
                remaining.append(action)
                Logger.log("OfflineQueue: failed \(action.type) (\(action.id)) attempt=\(action.attempts) error=\(error.localizedDescription)")
            }
        }
        save(remaining)
        publishQueueState(remaining)
        actions = remaining
    }

    /// Remove every action belonging to the current owner (used on sign-out).
    func clearQueue() async {
        save([])
        publishQueueState([])
    }

    // MARK: - Introspection

    func pending() -> [QueuedAction] { load() }

    // MARK: - Storage

    private func refreshCount() {
        publishQueueState(load())
    }

    private func storageKey() -> String {
        "\(storageKeyPrefix):\(ownerId)"
    }

    private func load() -> [QueuedAction] {
        guard let data = UserDefaults.standard.data(forKey: storageKey()),
              let items = try? JSONDecoder.iso8601.decode([QueuedAction].self, from: data) else {
            return []
        }
        return items
    }

    private func save(_ items: [QueuedAction]) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try? encoder.encode(items)
        UserDefaults.standard.set(data, forKey: storageKey())
    }

    private func publishQueueState(_ items: [QueuedAction]) {
        pendingCount = items.count
        pendingTypes = items.map(\.type)
        pendingEndpoints = items.map(\.endpoint)
    }

    // MARK: - Helpers

    static func generateIdempotencyKey(prefix: String) -> String {
        let ts = Int(Date().timeIntervalSince1970 * 1000)
        return "\(prefix.lowercased())_\(ts)_\(UUID().uuidString.prefix(8))"
    }
}
