import CoreLocation
import Foundation

/// Orchestrates the multi-signal auto-park pipeline.
///
/// Inputs (any of the following can trigger a transition):
/// - Motion activity classifier reports driving → walking.
/// - Bluetooth audio route disconnects while moving.
/// - Significant location change + slow speed + lot polygon match.
///
/// Output: a `ParkingCandidate` that either auto-starts a session (when the
/// signal is strong enough) or gets surfaced to the UI via `pendingCandidates`
/// for confirmation.
@MainActor
final class AutoParkCoordinator: ObservableObject {
    static let shared = AutoParkCoordinator()

    @Published private(set) var pendingCandidates: [ParkingCandidate] = []
    @Published private(set) var isRunning = false
    @Published private(set) var lastAutoCommitAt: Date?
    @Published private(set) var lastCommittedLotId: String?

    private var lastTriggerAt: Date?
    private var isInFlight = false
    private let cooldown: TimeInterval = 15
    private let maxCandidates = 3

    private init() {}

    // MARK: - Lifecycle

    func start() {
        guard !isRunning else { return }
        isRunning = true
        LocationEngine.shared.start()
        MotionEngine.shared.onParkingTransition = { [weak self] in
            Task { await self?.handleTrigger(source: "motion_activity") }
        }
        MotionEngine.shared.start()
        AudioRouteEngine.shared.onLikelyArrival = { [weak self] in
            Task { await self?.handleTrigger(source: "bluetooth_disconnect") }
        }
        AudioRouteEngine.shared.start()
    }

    func stop() {
        isRunning = false
        MotionEngine.shared.stop()
        AudioRouteEngine.shared.stop()
        LocationEngine.shared.stop()
    }

    // MARK: - User confirmations

    /// User tapped "Confirm" on a pending candidate — commit it and clear the
    /// rest of the list.
    func confirm(_ candidate: ParkingCandidate) async {
        pendingCandidates.removeAll()
        do {
            try await NetworkBridge.startSession(
                lotId: candidate.lotId,
                latitude: candidate.latitude,
                longitude: candidate.longitude,
                autoStarted: false,
                source: candidate.source,
                idempotencyKey: idempotencyKey(for: candidate)
            )
            await NativeSessionStore.shared.refresh()
        } catch {
            let payload = try? JSONSerialization.data(withJSONObject: [
                "lotId": candidate.lotId,
                "latitude": candidate.latitude,
                "longitude": candidate.longitude,
                "autoStarted": false,
                "source": candidate.source
            ])
            await OfflineQueue.shared.enqueue(
                type: "PARK",
                endpoint: "park/session",
                payload: payload,
                idempotencyKey: idempotencyKey(for: candidate)
            )
        }
    }

    /// User dismissed the confirmation sheet without picking a candidate.
    func dismissCandidates() {
        pendingCandidates.removeAll()
    }

    // MARK: - Signal handling

    func handleTrigger(source: String) async {
        guard isRunning, !isInFlight else { return }
        if let lastTriggerAt, Date().timeIntervalSince(lastTriggerAt) < cooldown { return }
        guard AuthManager.shared.isAuthenticated else { return }
        guard let location = LocationEngine.shared.latestLocation else { return }
        guard location.horizontalAccuracy > 0, location.horizontalAccuracy <= 80 else { return }
        if location.speed >= 0, location.speed > 6 { return }
        guard let lot = LotPolygonStore.lot(at: location.coordinate) else { return }

        let permit = AuthManager.shared.permitType
        if let permit, !permit.hasPrefix("__") {
            let validation = TicketShield.shared.validateParking(permitType: permit, lotId: lot.mapId)
            guard validation.isValid else {
                Logger.log("AutoPark: skipped (permit mismatch) lot=\(lot.mapId)")
                return
            }
        }

        isInFlight = true
        defer { isInFlight = false }
        lastTriggerAt = Date()

        let confidence = Self.confidence(for: source, location: location)
        let candidate = ParkingCandidate(
            id: UUID(),
            lotId: lot.mapId,
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            confidence: confidence,
            source: source
        )

        // Auto-commit if confidence is high; otherwise show the confirmation
        // sheet so the user can pick the right lot.
        if confidence >= 0.85 {
            let key = Self.stableIdempotencyKey(candidate: candidate)
            do {
                try await NetworkBridge.startSession(
                    lotId: lot.mapId,
                    latitude: location.coordinate.latitude,
                    longitude: location.coordinate.longitude,
                    autoStarted: true,
                    source: source,
                    idempotencyKey: key
                )
                lastAutoCommitAt = Date()
                lastCommittedLotId = lot.mapId
                await NativeSessionStore.shared.refresh()
                HapticManager.shared.playGuidancePulse(distance: 0)
            } catch {
                let payload = try? JSONSerialization.data(withJSONObject: [
                    "lotId": lot.mapId,
                    "latitude": location.coordinate.latitude,
                    "longitude": location.coordinate.longitude,
                    "autoStarted": true,
                    "source": source
                ])
                await OfflineQueue.shared.enqueue(
                    type: "PARK",
                    endpoint: "park/session",
                    payload: payload,
                    idempotencyKey: key
                )
            }
        } else {
            // Surface for confirmation. De-dupe by lotId so bouncing between
            // motion and BT doesn't enqueue the same candidate twice.
            var updated = pendingCandidates.filter { $0.lotId != candidate.lotId }
            updated.insert(candidate, at: 0)
            pendingCandidates = Array(updated.prefix(maxCandidates))
        }
    }

    // MARK: - Helpers

    private static func confidence(for source: String, location: CLLocation) -> Double {
        let baseline: Double
        switch source {
        case "bluetooth_disconnect": baseline = 0.9
        case "motion_activity": baseline = 0.82
        default: baseline = 0.7
        }
        let accuracyBonus = location.horizontalAccuracy <= 20 ? 0.05 : 0
        let stationaryBonus = (location.speed >= 0 && location.speed < 1.5) ? 0.05 : 0
        return min(1.0, baseline + accuracyBonus + stationaryBonus)
    }

    private static func stableIdempotencyKey(candidate: ParkingCandidate) -> String {
        // Bucket by lot + 5-minute window so rapid retries collapse.
        let bucket = Int(Date().timeIntervalSince1970 / 300)
        return "autopark_\(candidate.lotId)_\(bucket)"
    }

    private func idempotencyKey(for candidate: ParkingCandidate) -> String {
        Self.stableIdempotencyKey(candidate: candidate)
    }
}
