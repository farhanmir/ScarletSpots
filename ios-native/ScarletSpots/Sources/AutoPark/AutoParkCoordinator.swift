import CoreLocation
import Foundation

struct AutoParkGateStatus: Identifiable, Codable {
    let key: String
    let label: String
    let passed: Bool
    let detail: String

    var id: String { key }
}

struct AutoParkLiveSnapshot: Identifiable, Codable {
    let id: UUID
    let timestamp: Date
    let mode: String
    let triggerSource: String?
    let decision: String
    let reason: String
    let confidence: Double?
    let threshold: Double
    let lotId: String?
    let latitude: Double?
    let longitude: Double?
    let horizontalAccuracy: Double?
    let speedMetersPerSecond: Double?
    let locationAgeSeconds: Double?
    let cooldownRemainingSeconds: Double
    let isDriving: Bool
    let activeSessionPresent: Bool
    let hasAlwaysLocationPermission: Bool
    let locationAuthorizationLabel: String
    let reducedAccuracy: Bool
    let motionAvailable: Bool
    let motionAuthorized: Bool
    let lastAudioDisconnectSecondsAgo: Double?
    let queueDepth: Int
    let checks: [AutoParkGateStatus]

    static var placeholder: AutoParkLiveSnapshot {
        AutoParkLiveSnapshot(
            id: UUID(),
            timestamp: Date(),
            mode: "monitoring",
            triggerSource: nil,
            decision: "idle",
            reason: "awaiting_signal",
            confidence: nil,
            threshold: 0.80,
            lotId: nil,
            latitude: nil,
            longitude: nil,
            horizontalAccuracy: nil,
            speedMetersPerSecond: nil,
            locationAgeSeconds: nil,
            cooldownRemainingSeconds: 0,
            isDriving: false,
            activeSessionPresent: false,
            hasAlwaysLocationPermission: false,
            locationAuthorizationLabel: "not_determined",
            reducedAccuracy: true,
            motionAvailable: false,
            motionAuthorized: false,
            lastAudioDisconnectSecondsAgo: nil,
            queueDepth: 0,
            checks: []
        )
    }
}

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
    @Published private(set) var liveSnapshot: AutoParkLiveSnapshot = .placeholder
    @Published private(set) var decisionHistory: [AutoParkLiveSnapshot] = []

    private var lastTriggerAt: Date?
    private var isInFlight = false
    private let cooldown: TimeInterval = 15
    private let maxCandidates = 3
    private let autoCommitThreshold: Double = 0.80
    private let maxHistory = 80
    private let maxLocationAgeSeconds: TimeInterval = 25
    private let minLocationTriggerInterval: TimeInterval = 6
    private var liveTimer: Timer?
    private var lastLocationTriggerAt: Date?

    private init() {}

    // MARK: - Lifecycle

    func start() {
        guard !isRunning else { return }
        isRunning = true
        LocationEngine.shared.start()
        LocationEngine.shared.onLocationUpdate = { [weak self] location in
            Task { @MainActor [weak self] in
                guard let self else { return }
                guard self.shouldTriggerFromLocation(location) else { return }
                await self.handleTrigger(source: "location_update")
            }
        }
        MotionEngine.shared.onParkingTransition = { [weak self] in
            Task { await self?.handleTrigger(source: "motion_activity") }
        }
        MotionEngine.shared.start()
        AudioRouteEngine.shared.onLikelyArrival = { [weak self] in
            Task { await self?.handleTrigger(source: "bluetooth_disconnect") }
        }
        AudioRouteEngine.shared.start()
        startLiveMonitor()
        refreshLiveSnapshot()
    }

    func stop() {
        isRunning = false
        MotionEngine.shared.stop()
        AudioRouteEngine.shared.stop()
        LocationEngine.shared.stop()
        LocationEngine.shared.onLocationUpdate = nil
        liveTimer?.invalidate()
        liveTimer = nil
        refreshLiveSnapshot()
    }

    func refreshLiveSnapshot() {
        let evaluation = evaluate(source: nil)
        publishSnapshot(
            mode: "monitoring",
            source: nil,
            decision: "monitoring",
            reason: evaluation.reason,
            confidence: nil,
            lotId: evaluation.lot?.mapId,
            location: evaluation.location,
            cooldownRemaining: evaluation.cooldownRemaining,
            checks: evaluation.checks,
            appendToHistory: false
        )
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
        if source == "location_update" {
            lastLocationTriggerAt = Date()
        }
        let evaluation = evaluate(source: source)
        publishSnapshot(
            mode: "trigger",
            source: source,
            decision: evaluation.preliminaryDecision,
            reason: evaluation.reason,
            confidence: evaluation.confidence,
            lotId: evaluation.lot?.mapId,
            location: evaluation.location,
            cooldownRemaining: evaluation.cooldownRemaining,
            checks: evaluation.checks,
            appendToHistory: true
        )

        guard evaluation.hardGatesPassed,
              let lot = evaluation.lot,
              let location = evaluation.location,
              let candidate = evaluation.candidate,
              let confidence = evaluation.confidence
        else {
            Logger.log("AutoPark: skipped source=\(source) reason=\(evaluation.reason)")
            return
        }

        // If hard gates pass but confidence is below threshold, still surface
        // the candidate for manual confirmation to preserve auto-park utility.
        if confidence < autoCommitThreshold {
            var updated = pendingCandidates.filter { $0.lotId != candidate.lotId }
            updated.insert(candidate, at: 0)
            pendingCandidates = Array(updated.prefix(maxCandidates))
            publishSnapshot(
                mode: "trigger",
                source: source,
                decision: "needs_confirmation",
                reason: "confidence_below_threshold",
                confidence: confidence,
                lotId: lot.mapId,
                location: location,
                cooldownRemaining: 0,
                checks: evaluation.checks,
                appendToHistory: true
            )
            return
        }

        isInFlight = true
        defer {
            isInFlight = false
            refreshLiveSnapshot()
        }
        lastTriggerAt = Date()

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
            publishSnapshot(
                mode: "trigger",
                source: source,
                decision: "session_started",
                reason: "all_conditions_passed",
                confidence: confidence,
                lotId: lot.mapId,
                location: location,
                cooldownRemaining: 0,
                checks: evaluation.checks,
                appendToHistory: true
            )
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
            publishSnapshot(
                mode: "trigger",
                source: source,
                decision: "queued_offline",
                reason: "network_error",
                confidence: confidence,
                lotId: lot.mapId,
                location: location,
                cooldownRemaining: 0,
                checks: evaluation.checks,
                appendToHistory: true
            )
        }
    }

    // MARK: - Helpers

    private struct TriggerEvaluation {
        let location: CLLocation?
        let lot: Lot?
        let candidate: ParkingCandidate?
        let confidence: Double?
        let cooldownRemaining: TimeInterval
        let hardGatesPassed: Bool
        let preliminaryDecision: String
        let reason: String
        let checks: [AutoParkGateStatus]
    }

    private func shouldTriggerFromLocation(_ location: CLLocation) -> Bool {
        guard isRunning else { return false }
        guard LocationEngine.shared.hasBackgroundPermission else { return false }
        guard NativeSessionStore.shared.activeSession == nil else { return false }
        guard !isInFlight else { return false }
        let throttleReady = Date().timeIntervalSince(lastLocationTriggerAt ?? .distantPast) >= minLocationTriggerInterval
        guard throttleReady else { return false }
        let accuracyOK = location.horizontalAccuracy > 0 && location.horizontalAccuracy <= 65
        guard accuracyOK else { return false }
        let speed = location.speed
        let speedOK = speed < 0 || speed <= 4.5
        guard speedOK else { return false }
        guard LotPolygonStore.lot(at: location.coordinate) != nil else { return false }
        return true
    }

    private func startLiveMonitor() {
        liveTimer?.invalidate()
        liveTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.refreshLiveSnapshot()
            }
        }
    }

    private func evaluate(source: String?) -> TriggerEvaluation {
        var checks: [AutoParkGateStatus] = []
        let now = Date()

        func addCheck(_ key: String, _ label: String, _ passed: Bool, _ detail: String) {
            checks.append(AutoParkGateStatus(key: key, label: label, passed: passed, detail: detail))
        }

        addCheck("engine_running", "Auto-Park engine running", isRunning, isRunning ? "Listening for signals" : "Engine idle")
        guard isRunning else {
            return TriggerEvaluation(
                location: LocationEngine.shared.latestLocation,
                lot: nil,
                candidate: nil,
                confidence: nil,
                cooldownRemaining: 0,
                hardGatesPassed: false,
                preliminaryDecision: "blocked",
                reason: "engine_not_running",
                checks: checks
            )
        }

        let cooldownRemaining = max(0, cooldown - (now.timeIntervalSince(lastTriggerAt ?? .distantPast)))
        let cooldownReady = cooldownRemaining <= 0.001
        addCheck(
            "cooldown_ready",
            "Cooldown ready",
            cooldownReady,
            cooldownReady ? "No active cooldown" : "Wait \(Int(ceil(cooldownRemaining)))s"
        )
        guard cooldownReady else {
            return TriggerEvaluation(
                location: LocationEngine.shared.latestLocation,
                lot: nil,
                candidate: nil,
                confidence: nil,
                cooldownRemaining: cooldownRemaining,
                hardGatesPassed: false,
                preliminaryDecision: "blocked",
                reason: "cooldown_active",
                checks: checks
            )
        }

        let authenticated = AuthManager.shared.isAuthenticated
        addCheck("authenticated", "User authenticated", authenticated, authenticated ? "Signed in" : "Not signed in")
        guard authenticated else {
            return TriggerEvaluation(
                location: LocationEngine.shared.latestLocation,
                lot: nil,
                candidate: nil,
                confidence: nil,
                cooldownRemaining: 0,
                hardGatesPassed: false,
                preliminaryDecision: "blocked",
                reason: "not_authenticated",
                checks: checks
            )
        }

        let hasAlways = LocationEngine.shared.hasBackgroundPermission
        addCheck(
            "always_permission",
            "Always location permission",
            hasAlways,
            hasAlways ? "Background updates enabled" : "Grant Always in Settings"
        )
        guard hasAlways else {
            return TriggerEvaluation(
                location: LocationEngine.shared.latestLocation,
                lot: nil,
                candidate: nil,
                confidence: nil,
                cooldownRemaining: 0,
                hardGatesPassed: false,
                preliminaryDecision: "blocked",
                reason: "missing_always_location_permission",
                checks: checks
            )
        }

        let activeSessionPresent = NativeSessionStore.shared.activeSession != nil
        addCheck(
            "active_session",
            "No active parking session",
            !activeSessionPresent,
            activeSessionPresent ? "End current session before auto-start" : "No active session"
        )
        guard !activeSessionPresent else {
            return TriggerEvaluation(
                location: LocationEngine.shared.latestLocation,
                lot: nil,
                candidate: nil,
                confidence: nil,
                cooldownRemaining: 0,
                hardGatesPassed: false,
                preliminaryDecision: "blocked",
                reason: "already_has_active_session",
                checks: checks
            )
        }

        guard let location = LocationEngine.shared.latestLocation else {
            addCheck("location_available", "Location available", false, "No fix yet")
            return TriggerEvaluation(
                location: nil,
                lot: nil,
                candidate: nil,
                confidence: nil,
                cooldownRemaining: 0,
                hardGatesPassed: false,
                preliminaryDecision: "blocked",
                reason: "missing_location",
                checks: checks
            )
        }
        addCheck("location_available", "Location available", true, "Fix received")

        if let latestAt = LocationEngine.shared.latestLocationAt {
            let locationAge = Date().timeIntervalSince(latestAt)
            let locationFresh = locationAge <= maxLocationAgeSeconds
            addCheck(
                "location_fresh",
                "Location age <= \(Int(maxLocationAgeSeconds))s",
                locationFresh,
                String(format: "%.1f s old", locationAge)
            )
            guard locationFresh else {
                return TriggerEvaluation(
                    location: location,
                    lot: nil,
                    candidate: nil,
                    confidence: nil,
                    cooldownRemaining: 0,
                    hardGatesPassed: false,
                    preliminaryDecision: "blocked",
                    reason: "stale_location",
                    checks: checks
                )
            }
        } else {
            addCheck("location_fresh", "Location age <= \(Int(maxLocationAgeSeconds))s", false, "Missing timestamp")
            return TriggerEvaluation(
                location: location,
                lot: nil,
                candidate: nil,
                confidence: nil,
                cooldownRemaining: 0,
                hardGatesPassed: false,
                preliminaryDecision: "blocked",
                reason: "stale_location",
                checks: checks
            )
        }

        let accuracyPass = location.horizontalAccuracy > 0 && location.horizontalAccuracy <= 80
        addCheck(
            "accuracy_ok",
            "Horizontal accuracy <= 80m",
            accuracyPass,
            String(format: "%.1f m", location.horizontalAccuracy)
        )
        guard accuracyPass else {
            return TriggerEvaluation(
                location: location,
                lot: nil,
                candidate: nil,
                confidence: nil,
                cooldownRemaining: 0,
                hardGatesPassed: false,
                preliminaryDecision: "blocked",
                reason: "poor_accuracy",
                checks: checks
            )
        }

        let speed = location.speed
        let speedPass = speed < 0 || speed <= 6
        addCheck(
            "speed_ok",
            "Speed <= 6 m/s",
            speedPass,
            speed < 0 ? "Speed unavailable" : String(format: "%.2f m/s", speed)
        )
        guard speedPass else {
            return TriggerEvaluation(
                location: location,
                lot: nil,
                candidate: nil,
                confidence: nil,
                cooldownRemaining: 0,
                hardGatesPassed: false,
                preliminaryDecision: "blocked",
                reason: "speed_too_high",
                checks: checks
            )
        }

        guard let lot = LotPolygonStore.lot(at: location.coordinate) else {
            addCheck("inside_lot", "Inside known lot polygon", false, "No lot boundary match")
            return TriggerEvaluation(
                location: location,
                lot: nil,
                candidate: nil,
                confidence: nil,
                cooldownRemaining: 0,
                hardGatesPassed: false,
                preliminaryDecision: "blocked",
                reason: "outside_known_lot",
                checks: checks
            )
        }
        addCheck("inside_lot", "Inside known lot polygon", true, lot.shortName)

        let permit = AuthManager.shared.permitType
        if let permit, !permit.hasPrefix("__") {
            let validation = TicketShield.shared.validateParking(permitType: permit, lotId: lot.mapId)
            addCheck(
                "permit_ok",
                "Permit allows this lot",
                validation.isValid,
                validation.message
            )
            guard validation.isValid else {
                return TriggerEvaluation(
                    location: location,
                    lot: lot,
                    candidate: nil,
                    confidence: nil,
                    cooldownRemaining: 0,
                    hardGatesPassed: false,
                    preliminaryDecision: "blocked",
                    reason: "permit_mismatch",
                    checks: checks
                )
            }
        } else {
            addCheck("permit_ok", "Permit allows this lot", true, "No permit restriction active")
        }

        let inFlightAvailable = !isInFlight
        addCheck("inflight", "Pipeline idle", inFlightAvailable, inFlightAvailable ? "Ready" : "Auto-Park is busy")
        guard inFlightAvailable else {
            return TriggerEvaluation(
                location: location,
                lot: lot,
                candidate: nil,
                confidence: nil,
                cooldownRemaining: 0,
                hardGatesPassed: false,
                preliminaryDecision: "blocked",
                reason: "in_flight",
                checks: checks
            )
        }

        guard let source else {
            addCheck("signal", "Trigger signal received", false, "Waiting for motion/audio trigger")
            return TriggerEvaluation(
                location: location,
                lot: lot,
                candidate: nil,
                confidence: nil,
                cooldownRemaining: 0,
                hardGatesPassed: true,
                preliminaryDecision: "monitoring",
                reason: "awaiting_signal",
                checks: checks
            )
        }

        addCheck("signal", "Trigger signal received", true, source)
        let confidence = Self.confidence(for: source, location: location)
        let confidencePass = confidence >= autoCommitThreshold
        addCheck(
            "confidence",
            String(format: "Confidence >= %.2f", autoCommitThreshold),
            confidencePass,
            String(format: "%.2f", confidence)
        )

        let candidate = ParkingCandidate(
            id: UUID(),
            lotId: lot.mapId,
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            confidence: confidence,
            source: source
        )

        return TriggerEvaluation(
            location: location,
            lot: lot,
            candidate: candidate,
            confidence: confidence,
            cooldownRemaining: 0,
            hardGatesPassed: true,
            preliminaryDecision: confidencePass ? "ready_to_start" : "needs_confirmation",
            reason: confidencePass ? "all_conditions_passed" : "confidence_below_threshold",
            checks: checks
        )
    }

    private func publishSnapshot(
        mode: String,
        source: String?,
        decision: String,
        reason: String,
        confidence: Double?,
        lotId: String?,
        location: CLLocation?,
        cooldownRemaining: TimeInterval,
        checks: [AutoParkGateStatus],
        appendToHistory: Bool
    ) {
        let snapshot = AutoParkLiveSnapshot(
            id: UUID(),
            timestamp: Date(),
            mode: mode,
            triggerSource: source,
            decision: decision,
            reason: reason,
            confidence: confidence,
            threshold: autoCommitThreshold,
            lotId: lotId,
            latitude: location?.coordinate.latitude,
            longitude: location?.coordinate.longitude,
            horizontalAccuracy: location?.horizontalAccuracy,
            speedMetersPerSecond: location?.speed,
            locationAgeSeconds: LocationEngine.shared.latestLocationAt.map { Date().timeIntervalSince($0) },
            cooldownRemainingSeconds: cooldownRemaining,
            isDriving: MotionEngine.shared.isDriving,
            activeSessionPresent: NativeSessionStore.shared.activeSession != nil,
            hasAlwaysLocationPermission: LocationEngine.shared.hasBackgroundPermission,
            locationAuthorizationLabel: Self.authorizationLabel(LocationEngine.shared.authorization),
            reducedAccuracy: LocationEngine.shared.accuracyAuthorization == .reducedAccuracy,
            motionAvailable: MotionEngine.shared.isAvailable,
            motionAuthorized: MotionEngine.shared.authorizationStatus == .authorized,
            lastAudioDisconnectSecondsAgo: AudioRouteEngine.shared.lastDisconnectAt.map { Date().timeIntervalSince($0) },
            queueDepth: OfflineQueue.shared.pendingCount,
            checks: checks
        )
        liveSnapshot = snapshot
        if appendToHistory {
            decisionHistory.insert(snapshot, at: 0)
            if decisionHistory.count > maxHistory {
                decisionHistory = Array(decisionHistory.prefix(maxHistory))
            }
        }
    }

    private static func confidence(for source: String, location: CLLocation) -> Double {
        let baseline: Double
        switch source {
        case "bluetooth_disconnect": baseline = 0.9
        case "motion_activity": baseline = 0.82
        case "location_update": baseline = 0.86
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

    private static func authorizationLabel(_ status: CLAuthorizationStatus) -> String {
        switch status {
        case .authorizedAlways: return "authorized_always"
        case .authorizedWhenInUse: return "authorized_when_in_use"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "not_determined"
        @unknown default: return "unknown"
        }
    }
}
