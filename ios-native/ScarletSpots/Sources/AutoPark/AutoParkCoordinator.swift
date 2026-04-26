import CoreLocation
import Foundation
import UIKit

struct AutoParkGateStatus: Identifiable, Codable {
    let key: String
    let label: String
    let passed: Bool
    let detail: String
    let reasonCode: String?

    var id: String { key }
}

struct AutoParkLiveSnapshot: Identifiable, Codable {
    let id: UUID
    let timestamp: Date
    let phase: String
    let wakeReason: String
    let monitoringMode: String
    let triggerSource: String?
    let decisionKind: String
    let decision: String
    let reason: String
    let explanation: String
    let confidence: Double?
    let threshold: Double
    let lotId: String?
    let lotName: String?
    let latitude: Double?
    let longitude: Double?
    let horizontalAccuracy: Double?
    let speedMetersPerSecond: Double?
    let courseDegrees: Double?
    let headingDegrees: Double?
    let locationAgeSeconds: Double?
    let cooldownRemainingSeconds: Double
    let isDriving: Bool
    let activeSessionPresent: Bool
    let activeSessionLotId: String?
    let hasAlwaysLocationPermission: Bool
    let locationAuthorizationLabel: String
    let reducedAccuracy: Bool
    let motionAvailable: Bool
    let motionAuthorized: Bool
    let lastAudioDisconnectSecondsAgo: Double?
    let lastAudioReconnectSecondsAgo: Double?
    let queueDepth: Int
    let queueTypes: [String]
    let queueEndpoints: [String]
    let sessionTruthSource: String
    let lastFailure: String?
    let checks: [AutoParkGateStatus]

    static var placeholder: AutoParkLiveSnapshot {
        AutoParkLiveSnapshot(
            id: UUID(),
            timestamp: Date(),
            phase: "idle",
            wakeReason: "manual_open",
            monitoringMode: "idle",
            triggerSource: nil,
            decisionKind: "start",
            decision: "idle",
            reason: "awaiting_signal",
            explanation: "Auto-Park is waiting for a trigger.",
            confidence: nil,
            threshold: 0.80,
            lotId: nil,
            lotName: nil,
            latitude: nil,
            longitude: nil,
            horizontalAccuracy: nil,
            speedMetersPerSecond: nil,
            courseDegrees: nil,
            headingDegrees: nil,
            locationAgeSeconds: nil,
            cooldownRemainingSeconds: 0,
            isDriving: false,
            activeSessionPresent: false,
            activeSessionLotId: nil,
            hasAlwaysLocationPermission: false,
            locationAuthorizationLabel: "not_determined",
            reducedAccuracy: true,
            motionAvailable: false,
            motionAuthorized: false,
            lastAudioDisconnectSecondsAgo: nil,
            lastAudioReconnectSecondsAgo: nil,
            queueDepth: 0,
            queueTypes: [],
            queueEndpoints: [],
            sessionTruthSource: NativeSessionStore.TruthSource.none.rawValue,
            lastFailure: nil,
            checks: []
        )
    }
}

@MainActor
final class AutoParkCoordinator: ObservableObject {
    static let shared = AutoParkCoordinator()

    @Published private(set) var pendingCandidates: [ParkingCandidate] = []
    @Published private(set) var isRunning = false
    @Published private(set) var liveSnapshot: AutoParkLiveSnapshot = .placeholder
    @Published private(set) var decisionHistory: [AutoParkLiveSnapshot] = []
    @Published private(set) var lastStartSnapshot: AutoParkLiveSnapshot?
    @Published private(set) var lastEndSnapshot: AutoParkLiveSnapshot?

    private struct PersistedState: Codable {
        var lastWakeReason: String
        var lastTriggerSource: String?
        var lastTriggerAt: Date?
        var lastCommittedLotId: String?
        var parkedLatitude: Double?
        var parkedLongitude: Double?
        var lastFailure: String?
    }

    private struct StartEvaluation {
        let location: CLLocation?
        let lot: Lot?
        let checks: [AutoParkGateStatus]
        let confidence: Double?
        let reason: String
        let explanation: String
        let hardPass: Bool
        let candidate: ParkingCandidate?
    }

    private struct EndEvaluation {
        let checks: [AutoParkGateStatus]
        let confidence: Double?
        let reason: String
        let explanation: String
        let hardPass: Bool
    }

    private let stateKey = "autopark_state_v2"
    private let cooldown: TimeInterval = 15
    private let autoCommitThreshold: Double = 0.80
    private let candidateThreshold: Double = 0.62
    private let maxHistory = 120
    private let maxLocationAgeSeconds: TimeInterval = 30
    private let driveAwayDistanceMeters: CLLocationDistance = 320
    private let driveAwaySpeedMps: Double = 6.5
    private let driveAwayDuration: TimeInterval = 85
    private let locationThrottle: TimeInterval = 10

    private var didBootstrap = false
    private var pendingTriggerSource: String?
    private var pendingTriggerWakeReason: String?
    private var pendingDecisionKind: String = "start"
    private var lastDecisionAt: Date?
    private var driveAwayStartAt: Date?
    private var currentWakeReason = "manual_open"
    private var persistedState = PersistedState(lastWakeReason: "manual_open")
    private var isInFlight = false

    private init() {
        restoreState()
    }

    // MARK: - Lifecycle

    func bootstrap(launchReason: String, launchLocation: CLLocation? = nil) async {
        currentWakeReason = launchReason
        persistedState.lastWakeReason = launchReason
        persistState()

        await AuthManager.shared.checkSession()
        await NativeSessionStore.shared.bootstrapRefresh()

        didBootstrap = true
        await handleEligibilityChange(wakeReason: launchReason)

        if let launchLocation {
            LocationEngine.shared.onLocationUpdate?(launchLocation)
            await handleTrigger(
                source: "launch_replay",
                wakeReason: launchReason,
                kind: NativeSessionStore.shared.activeSession == nil ? "start" : "end",
                preferredLocation: launchLocation
            )
        } else {
            refreshLiveSnapshot()
        }
    }

    func handleEligibilityChange(wakeReason: String? = nil) async {
        if let wakeReason {
            currentWakeReason = wakeReason
            persistedState.lastWakeReason = wakeReason
            persistState()
        }

        let shouldRun = AuthManager.shared.isAuthenticated && LocationEngine.shared.hasBackgroundPermission
        if shouldRun {
            startSensing()
        } else {
            stopSensing()
        }
        refreshLiveSnapshot()
    }

    func noteManualOpen() {
        currentWakeReason = "manual_open"
        refreshLiveSnapshot()
    }

    func clearDiagnostics() {
        decisionHistory.removeAll()
        lastStartSnapshot = nil
        lastEndSnapshot = nil
        refreshLiveSnapshot()
    }

    func refreshSessionTruth() async {
        await NativeSessionStore.shared.bootstrapRefresh()
        refreshLiveSnapshot()
    }

    func refreshLiveSnapshot() {
        publishSnapshot(
            phase: isRunning ? "monitoring" : "idle",
            wakeReason: currentWakeReason,
            monitoringMode: currentMonitoringMode(),
            source: persistedState.lastTriggerSource,
            kind: NativeSessionStore.shared.activeSession == nil ? "start" : "end",
            decision: isRunning ? "monitoring" : "idle",
            reason: isRunning ? "awaiting_signal" : "engine_not_running",
            explanation: isRunning ? "Sensors are armed and waiting for a trigger." : "Auto-Park is not currently armed.",
            confidence: nil,
            lot: resolvedLot(for: LocationEngine.shared.latestLocation),
            location: LocationEngine.shared.latestLocation,
            checks: [],
            appendToHistory: false
        )
    }

    private func startSensing() {
        guard !isRunning else { return }
        isRunning = true
        LocationEngine.shared.startPassiveMonitoring()
        LocationEngine.shared.onLocationUpdate = { [weak self] location in
            Task { @MainActor [weak self] in
                await self?.handleLocationUpdate(location)
            }
        }
        LocationEngine.shared.onVisit = { [weak self] visit in
            Task { @MainActor [weak self] in
                await self?.handleVisit(visit)
            }
        }
        LocationEngine.shared.onRegionEvent = { [weak self] action, regionID, location in
            Task { @MainActor [weak self] in
                await self?.handleRegionEvent(action: action, regionID: regionID, location: location)
            }
        }
        MotionEngine.shared.onParkingTransition = { [weak self] in
            Task { @MainActor [weak self] in
                self?.armPendingTrigger(source: "motion_activity", wakeReason: "motion_transition", kind: "start")
            }
        }
        MotionEngine.shared.onDrivingResumed = { [weak self] in
            Task { @MainActor [weak self] in
                await self?.handleTrigger(source: "drive_away", wakeReason: "motion_driveaway", kind: "end", preferredLocation: LocationEngine.shared.latestLocation)
            }
        }
        MotionEngine.shared.start()
        AudioRouteEngine.shared.onLikelyArrival = { [weak self] in
            Task { @MainActor [weak self] in
                self?.armPendingTrigger(source: "bluetooth_disconnect", wakeReason: "audio_disconnect", kind: "start")
            }
        }
        AudioRouteEngine.shared.onLikelyDeparture = { [weak self] in
            Task { @MainActor [weak self] in
                await self?.handleTrigger(source: "audio_reconnect", wakeReason: "audio_reconnect", kind: "end", preferredLocation: LocationEngine.shared.latestLocation)
            }
        }
        AudioRouteEngine.shared.start()
    }

    private func stopSensing() {
        isRunning = false
        pendingTriggerSource = nil
        driveAwayStartAt = nil
        MotionEngine.shared.stop()
        AudioRouteEngine.shared.stop()
        LocationEngine.shared.stopPassiveMonitoring()
        LocationEngine.shared.stopTransientHighAccuracy(reason: "sensing_stopped")
    }

    // MARK: - User confirmations

    func confirm(_ candidate: ParkingCandidate) async {
        pendingCandidates.removeAll()
        do {
            try await NetworkBridge.startSession(
                lotId: candidate.lotId,
                latitude: candidate.latitude,
                longitude: candidate.longitude,
                autoStarted: false,
                source: candidate.source,
                idempotencyKey: stableStartIdempotencyKey(lotId: candidate.lotId)
            )
            await NativeSessionStore.shared.refresh()
            updateParkedState(from: candidate.latitude, longitude: candidate.longitude, lotId: candidate.lotId)
            publishManualResolution(source: candidate.source, decision: "session_started", reason: "manual_confirmation")
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
                idempotencyKey: stableStartIdempotencyKey(lotId: candidate.lotId)
            )
            persistedState.lastFailure = error.localizedDescription
            persistState()
            refreshLiveSnapshot()
        }
    }

    func dismissCandidates() {
        pendingCandidates.removeAll()
        refreshLiveSnapshot()
    }

    // MARK: - Trigger handling

    private func handleLocationUpdate(_ location: CLLocation) async {
        if let pending = pendingTriggerSource {
            let wake = pendingTriggerWakeReason ?? currentWakeReason
            let kind = pendingDecisionKind
            pendingTriggerSource = nil
            pendingTriggerWakeReason = nil
            await handleTrigger(source: pending, wakeReason: wake, kind: kind, preferredLocation: location)
            return
        }

        guard Date().timeIntervalSince(lastDecisionAt ?? .distantPast) >= locationThrottle else {
            evaluateDriveAway(location)
            return
        }

        if NativeSessionStore.shared.activeSession == nil {
            guard LocationEngine.shared.isNearCampus(location.coordinate) else { return }
            guard shouldStartFromLocation(location) else { return }
            await handleTrigger(source: "significant_location", wakeReason: "location_update", kind: "start", preferredLocation: location)
        } else {
            evaluateDriveAway(location)
        }
    }

    private func handleVisit(_ visit: CLVisit) async {
        let coordinate = CLLocationCoordinate2D(latitude: visit.coordinate.latitude, longitude: visit.coordinate.longitude)
        guard LocationEngine.shared.isNearCampus(coordinate) else { return }
        guard NativeSessionStore.shared.activeSession == nil else { return }
        let location = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        armPendingTrigger(source: "significant_location", wakeReason: "visit_event", kind: "start")
        await handleTrigger(source: "significant_location", wakeReason: "visit_event", kind: "start", preferredLocation: location)
    }

    private func handleRegionEvent(action: String, regionID: String, location: CLLocation?) async {
        guard action == "enter" else { return }
        guard NativeSessionStore.shared.activeSession == nil else { return }
        let wakeReason = "region_\(regionID)"
        armPendingTrigger(source: "significant_location", wakeReason: wakeReason, kind: "start")
        await handleTrigger(source: "significant_location", wakeReason: wakeReason, kind: "start", preferredLocation: location)
    }

    private func armPendingTrigger(source: String, wakeReason: String, kind: String) {
        pendingTriggerSource = source
        pendingTriggerWakeReason = wakeReason
        pendingDecisionKind = kind
        persistedState.lastTriggerSource = source
        persistedState.lastTriggerAt = Date()
        persistedState.lastWakeReason = wakeReason
        persistState()
        LocationEngine.shared.startTransientHighAccuracy(reason: source)
        publishSnapshot(
            phase: "trigger_received",
            wakeReason: wakeReason,
            monitoringMode: currentMonitoringMode(),
            source: source,
            kind: kind,
            decision: "trigger_received",
            reason: "awaiting_fresh_location",
            explanation: "A trigger arrived and Auto-Park is requesting a fresher location before deciding.",
            confidence: nil,
            lot: resolvedLot(for: LocationEngine.shared.latestLocation),
            location: LocationEngine.shared.latestLocation,
            checks: [],
            appendToHistory: true
        )
    }

    func handleTrigger(
        source: String,
        wakeReason: String,
        kind: String,
        preferredLocation: CLLocation?
    ) async {
        guard isRunning else { return }
        guard !isInFlight else { return }
        currentWakeReason = wakeReason
        persistedState.lastWakeReason = wakeReason
        persistedState.lastTriggerSource = source
        persistedState.lastTriggerAt = Date()
        persistState()
        lastDecisionAt = Date()

        let location = preferredLocation ?? LocationEngine.shared.latestLocation
        if kind == "end" {
            let evaluation = evaluateEnd(source: source, location: location)
            let lot = resolvedLot(for: location)
            let decision = evaluation.hardPass ? "session_ended" : "blocked"
            publishSnapshot(
                phase: "decision",
                wakeReason: wakeReason,
                monitoringMode: currentMonitoringMode(),
                source: source,
                kind: "end",
                decision: decision,
                reason: evaluation.reason,
                explanation: evaluation.explanation,
                confidence: evaluation.confidence,
                lot: lot,
                location: location,
                checks: evaluation.checks,
                appendToHistory: true
            )
            if evaluation.hardPass {
                await commitEnd(source: source, location: location, confidence: evaluation.confidence)
            }
            return
        }

        let evaluation = evaluateStart(source: source, location: location)
        publishSnapshot(
            phase: "decision",
            wakeReason: wakeReason,
            monitoringMode: currentMonitoringMode(),
            source: source,
            kind: "start",
            decision: evaluation.hardPass
                ? ((evaluation.confidence ?? 0) >= autoCommitThreshold ? "session_started" : "candidate_created")
                : "blocked",
            reason: evaluation.reason,
            explanation: evaluation.explanation,
            confidence: evaluation.confidence,
            lot: evaluation.lot,
            location: evaluation.location,
            checks: evaluation.checks,
            appendToHistory: true
        )

        guard evaluation.hardPass, let candidate = evaluation.candidate else { return }
        if (evaluation.confidence ?? 0) >= autoCommitThreshold {
            await commitStart(candidate: candidate, wakeReason: wakeReason)
        } else if (evaluation.confidence ?? 0) >= candidateThreshold {
            var updated = pendingCandidates.filter { $0.lotId != candidate.lotId }
            updated.insert(candidate, at: 0)
            pendingCandidates = Array(updated.prefix(3))
            refreshLiveSnapshot()
        }
    }

    private func commitStart(candidate: ParkingCandidate, wakeReason: String) async {
        guard !isInFlight else { return }
        isInFlight = true
        defer {
            isInFlight = false
            LocationEngine.shared.stopTransientHighAccuracy(reason: "start_commit_complete")
            refreshLiveSnapshot()
        }

        let key = stableStartIdempotencyKey(lotId: candidate.lotId)
        do {
            try await NetworkBridge.startSession(
                lotId: candidate.lotId,
                latitude: candidate.latitude,
                longitude: candidate.longitude,
                autoStarted: true,
                source: candidate.source,
                idempotencyKey: key
            )
            await NativeSessionStore.shared.refresh()
            updateParkedState(from: candidate.latitude, longitude: candidate.longitude, lotId: candidate.lotId)
            HapticManager.shared.playGuidancePulse(distance: 0)
            publishSnapshot(
                phase: "mutation",
                wakeReason: wakeReason,
                monitoringMode: currentMonitoringMode(),
                source: candidate.source,
                kind: "start",
                decision: "session_started",
                reason: "all_conditions_passed",
                explanation: "Auto-Park started a session because the arrival signals, lot match, and parking gates all passed.",
                confidence: candidate.confidence,
                lot: LotRepository.shared.byId(candidate.lotId),
                location: CLLocation(latitude: candidate.latitude, longitude: candidate.longitude),
                checks: liveSnapshot.checks,
                appendToHistory: true
            )
        } catch {
            let payload = try? JSONSerialization.data(withJSONObject: [
                "lotId": candidate.lotId,
                "latitude": candidate.latitude,
                "longitude": candidate.longitude,
                "autoStarted": true,
                "source": candidate.source
            ])
            await OfflineQueue.shared.enqueue(
                type: "PARK",
                endpoint: "park/session",
                payload: payload,
                idempotencyKey: key
            )
            updateParkedState(from: candidate.latitude, longitude: candidate.longitude, lotId: candidate.lotId)
            persistedState.lastFailure = error.localizedDescription
            persistState()
            publishSnapshot(
                phase: "mutation",
                wakeReason: wakeReason,
                monitoringMode: currentMonitoringMode(),
                source: candidate.source,
                kind: "start",
                decision: "queued_offline",
                reason: "network_error",
                explanation: "Auto-Park detected a likely park, but the network request failed so the start was queued for replay.",
                confidence: candidate.confidence,
                lot: LotRepository.shared.byId(candidate.lotId),
                location: CLLocation(latitude: candidate.latitude, longitude: candidate.longitude),
                checks: liveSnapshot.checks,
                appendToHistory: true
            )
        }
    }

    private func commitEnd(source: String, location: CLLocation?, confidence: Double?) async {
        guard !isInFlight else { return }
        isInFlight = true
        defer {
            isInFlight = false
            LocationEngine.shared.stopTransientHighAccuracy(reason: "end_commit_complete")
            refreshLiveSnapshot()
        }

        let key = stableEndIdempotencyKey()
        do {
            try await NetworkBridge.endSession(source: source, idempotencyKey: key)
            await NativeSessionStore.shared.refresh()
            clearParkedState()
            publishSnapshot(
                phase: "mutation",
                wakeReason: currentWakeReason,
                monitoringMode: currentMonitoringMode(),
                source: source,
                kind: "end",
                decision: "session_ended",
                reason: "departure_confirmed",
                explanation: "Auto-End closed the session because departure evidence was strong enough to confirm you left the lot.",
                confidence: confidence,
                lot: resolvedLot(for: location),
                location: location,
                checks: liveSnapshot.checks,
                appendToHistory: true
            )
        } catch {
            let body = try? JSONSerialization.data(withJSONObject: ["source": source])
            await OfflineQueue.shared.enqueue(
                type: "END_SESSION",
                endpoint: "park/session/end",
                payload: body,
                idempotencyKey: key
            )
            persistedState.lastFailure = error.localizedDescription
            persistState()
            publishSnapshot(
                phase: "mutation",
                wakeReason: currentWakeReason,
                monitoringMode: currentMonitoringMode(),
                source: source,
                kind: "end",
                decision: "queued_offline",
                reason: "network_error",
                explanation: "Auto-End confirmed departure but had to queue the end-session request because the network was unavailable.",
                confidence: confidence,
                lot: resolvedLot(for: location),
                location: location,
                checks: liveSnapshot.checks,
                appendToHistory: true
            )
        }
    }

    // MARK: - Evaluation

    private func evaluateStart(source: String, location: CLLocation?) -> StartEvaluation {
        var checks: [AutoParkGateStatus] = []
        let now = Date()

        func add(_ key: String, _ label: String, _ passed: Bool, _ detail: String, _ reasonCode: String? = nil) {
            checks.append(.init(key: key, label: label, passed: passed, detail: detail, reasonCode: reasonCode))
        }

        let authenticated = AuthManager.shared.isAuthenticated
        add("authenticated", "User authenticated", authenticated, authenticated ? "Signed in" : "Not signed in", "not_authenticated")
        guard authenticated else {
            return StartEvaluation(location: location, lot: nil, checks: checks, confidence: nil, reason: "not_authenticated", explanation: "Auto-Park only runs when you are signed in.", hardPass: false, candidate: nil)
        }

        let hasAlways = LocationEngine.shared.hasBackgroundPermission
        add("always_permission", "Always location permission", hasAlways, hasAlways ? "Background sensing enabled" : "Requires Always location", "missing_always_location_permission")
        guard hasAlways else {
            return StartEvaluation(location: location, lot: nil, checks: checks, confidence: nil, reason: "missing_always_location_permission", explanation: "Auto-Park needs Always location access for background sensing.", hardPass: false, candidate: nil)
        }

        let activeSessionPresent = NativeSessionStore.shared.activeSession != nil
        add("active_session", "No active parking session", !activeSessionPresent, activeSessionPresent ? "Active session already exists" : "No active session", "already_has_active_session")
        guard !activeSessionPresent else {
            return StartEvaluation(location: location, lot: nil, checks: checks, confidence: nil, reason: "already_has_active_session", explanation: "Auto-Park will not start a new session while one is already active.", hardPass: false, candidate: nil)
        }

        guard let location else {
            add("location_available", "Location available", false, "No location fix yet", "missing_location")
            return StartEvaluation(location: nil, lot: nil, checks: checks, confidence: nil, reason: "missing_location", explanation: "A trigger arrived, but Auto-Park still needs a usable location fix.", hardPass: false, candidate: nil)
        }
        add("location_available", "Location available", true, "Fix received")

        let locationAge = now.timeIntervalSince(location.timestamp)
        let locationFresh = locationAge <= maxLocationAgeSeconds
        add("location_fresh", "Fresh location", locationFresh, String(format: "%.1f s old", locationAge), "stale_location")
        guard locationFresh else {
            return StartEvaluation(location: location, lot: nil, checks: checks, confidence: nil, reason: "stale_location", explanation: "The latest location is too old to trust for a parking decision.", hardPass: false, candidate: nil)
        }

        let accuracyPass = location.horizontalAccuracy > 0 && location.horizontalAccuracy <= 80
        add("accuracy", "Horizontal accuracy <= 80m", accuracyPass, String(format: "%.1f m", location.horizontalAccuracy), "poor_accuracy")
        guard accuracyPass else {
            return StartEvaluation(location: location, lot: nil, checks: checks, confidence: nil, reason: "poor_accuracy", explanation: "The GPS fix is not precise enough to confidently resolve a parking lot.", hardPass: false, candidate: nil)
        }

        let speed = location.speed
        let speedPass = speed < 0 || speed <= 6
        add("speed", "Arrival speed <= 6 m/s", speedPass, speed < 0 ? "Speed unavailable" : String(format: "%.2f m/s", speed), "speed_too_high")
        guard speedPass else {
            return StartEvaluation(location: location, lot: nil, checks: checks, confidence: nil, reason: "speed_too_high", explanation: "The device is still moving too quickly to look parked.", hardPass: false, candidate: nil)
        }

        let nearCampus = LocationEngine.shared.isNearCampus(location.coordinate)
        add("campus", "Near Rutgers campus", nearCampus, nearCampus ? "Inside monitored campus radius" : "Outside campus radius", "outside_campus")
        guard nearCampus else {
            return StartEvaluation(location: location, lot: nil, checks: checks, confidence: nil, reason: "outside_campus", explanation: "Auto-Park avoids escalating location tracking when you are away from Rutgers.", hardPass: false, candidate: nil)
        }

        guard let lot = LotPolygonStore.lot(at: location.coordinate) else {
            add("lot_match", "Inside known lot polygon", false, "No lot boundary match", "outside_known_lot")
            return StartEvaluation(location: location, lot: nil, checks: checks, confidence: nil, reason: "outside_known_lot", explanation: "The device is not inside any known Rutgers parking lot polygon.", hardPass: false, candidate: nil)
        }
        add("lot_match", "Inside known lot polygon", true, lot.shortName)

        let permit = AuthManager.shared.permitType
        if let permit, !permit.hasPrefix("__") {
            let validation = TicketShield.shared.validateParking(permitType: permit, lotId: lot.mapId)
            add("permit", "Permit-compatible lot", validation.isValid, validation.message, "permit_mismatch")
            guard validation.isValid else {
                return StartEvaluation(location: location, lot: lot, checks: checks, confidence: nil, reason: "permit_mismatch", explanation: "The resolved lot does not match your current permit settings.", hardPass: false, candidate: nil)
            }
        } else {
            add("permit", "Permit-compatible lot", true, "No permit restriction active")
        }

        let cooldownRemaining = max(0, cooldown - now.timeIntervalSince(lastDecisionAt ?? .distantPast))
        let cooldownPass = cooldownRemaining <= 0.001
        add("cooldown", "Cooldown clear", cooldownPass, cooldownPass ? "Ready" : "Wait \(Int(ceil(cooldownRemaining)))s", "cooldown_active")
        guard cooldownPass else {
            return StartEvaluation(location: location, lot: lot, checks: checks, confidence: nil, reason: "cooldown_active", explanation: "Auto-Park recently made a decision and is waiting before acting again.", hardPass: false, candidate: nil)
        }

        let confidence = confidenceForStart(source: source, location: location, lot: lot)
        add("confidence", String(format: "Confidence >= %.2f", candidateThreshold), confidence >= candidateThreshold, String(format: "%.2f", confidence), "confidence_below_threshold")
        let candidate = ParkingCandidate(
            id: UUID(),
            lotId: lot.mapId,
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            confidence: confidence,
            source: source
        )
        let reason = confidence >= autoCommitThreshold ? "all_conditions_passed" : "confidence_below_auto_commit_threshold"
        let explanation = confidence >= autoCommitThreshold
            ? "Arrival evidence is strong enough to auto-start a session."
            : "Parking evidence looks plausible, but not strong enough to auto-start without confirmation."
        return StartEvaluation(location: location, lot: lot, checks: checks, confidence: confidence, reason: reason, explanation: explanation, hardPass: true, candidate: candidate)
    }

    private func evaluateEnd(source: String, location: CLLocation?) -> EndEvaluation {
        var checks: [AutoParkGateStatus] = []

        func add(_ key: String, _ label: String, _ passed: Bool, _ detail: String, _ reasonCode: String? = nil) {
            checks.append(.init(key: key, label: label, passed: passed, detail: detail, reasonCode: reasonCode))
        }

        guard let session = NativeSessionStore.shared.activeSession else {
            add("active_session", "Active session exists", false, "No active session to end", "no_active_session")
            return EndEvaluation(checks: checks, confidence: nil, reason: "no_active_session", explanation: "Auto-End only runs when a parking session is active.", hardPass: false)
        }
        add("active_session", "Active session exists", true, session.lotId)

        if source == "audio_reconnect" {
            add("departure_signal", "Departure signal strong", true, "Bluetooth/car audio reconnected")
            return EndEvaluation(checks: checks, confidence: 0.96, reason: "departure_confirmed", explanation: "The car audio reconnect signal is strong enough to end the parking session.", hardPass: true)
        }

        guard let parked = parkedLocation(), let location else {
            add("parked_context", "Parked context available", false, "Missing parked coordinate", "missing_parked_context")
            return EndEvaluation(checks: checks, confidence: nil, reason: "missing_parked_context", explanation: "Auto-End needs a remembered parked location or lot to confirm departure.", hardPass: false)
        }
        add("parked_context", "Parked context available", true, "Parked coordinate restored")

        let distance = location.distance(from: parked)
        let distancePass = distance >= driveAwayDistanceMeters
        add("distance", "Moved away from parked location", distancePass, "\(Int(distance.rounded())) m", "driveaway_distance_too_small")

        let speed = location.speed
        let speedPass = speed >= driveAwaySpeedMps || MotionEngine.shared.isDriving
        add("speed", "Departure speed / motion", speedPass, speed >= 0 ? String(format: "%.2f m/s", speed) : "speed unavailable", "driveaway_speed_too_low")

        let sustained = (driveAwayStartAt != nil) && Date().timeIntervalSince(driveAwayStartAt ?? .distantPast) >= driveAwayDuration
        add("duration", "Drive-away sustained", sustained, driveAwayStartAt == nil ? "Awaiting sustained departure" : "\(Int(Date().timeIntervalSince(driveAwayStartAt!).rounded())) s", "driveaway_duration_too_short")

        let confidence: Double = source == "drive_away" && distancePass && speedPass && sustained ? 0.88 : 0.42
        let hardPass = distancePass && speedPass && sustained
        let reason = hardPass ? "departure_confirmed" : "departure_not_confident_enough"
        let explanation = hardPass
            ? "The device has moved far enough away, fast enough, for long enough to confirm departure."
            : "Departure evidence exists, but Auto-End is still waiting for stronger proof before ending the session."
        return EndEvaluation(checks: checks, confidence: confidence, reason: reason, explanation: explanation, hardPass: hardPass)
    }

    private func confidenceForStart(source: String, location: CLLocation, lot: Lot) -> Double {
        var score: Double
        switch source {
        case "bluetooth_disconnect": score = 0.90
        case "launch_replay": score = 0.84
        case "motion_activity": score = 0.82
        case "significant_location": score = 0.76
        default: score = 0.70
        }
        if location.horizontalAccuracy <= 20 { score += 0.05 }
        if location.speed >= 0 && location.speed < 1.5 { score += 0.05 }
        if lot.garage { score += 0.02 }
        return min(1.0, score)
    }

    private func shouldStartFromLocation(_ location: CLLocation) -> Bool {
        let speed = location.speed
        let accuracyOK = location.horizontalAccuracy > 0 && location.horizontalAccuracy <= 65
        let speedOK = speed < 0 || speed <= 4.5
        return accuracyOK && speedOK
    }

    private func evaluateDriveAway(_ location: CLLocation) {
        guard NativeSessionStore.shared.activeSession != nil else {
            driveAwayStartAt = nil
            return
        }
        guard let parked = parkedLocation() else {
            driveAwayStartAt = nil
            return
        }

        let distance = location.distance(from: parked)
        let movingAway = distance >= driveAwayDistanceMeters && (location.speed >= driveAwaySpeedMps || MotionEngine.shared.isDriving)
        if movingAway {
            if driveAwayStartAt == nil {
                driveAwayStartAt = Date()
                LocationEngine.shared.startTransientHighAccuracy(reason: "drive_away_watch")
            } else if let driveAwayStartAt, Date().timeIntervalSince(driveAwayStartAt) >= driveAwayDuration {
                Task { @MainActor [weak self] in
                    await self?.handleTrigger(source: "drive_away", wakeReason: "drive_away", kind: "end", preferredLocation: location)
                }
            }
        } else {
            driveAwayStartAt = nil
        }
    }

    // MARK: - Persistence and snapshot helpers

    private func publishManualResolution(source: String, decision: String, reason: String) {
        publishSnapshot(
            phase: "mutation",
            wakeReason: currentWakeReason,
            monitoringMode: currentMonitoringMode(),
            source: source,
            kind: "start",
            decision: decision,
            reason: reason,
            explanation: "A pending parking candidate was resolved manually.",
            confidence: liveSnapshot.confidence,
            lot: resolvedLot(for: LocationEngine.shared.latestLocation),
            location: LocationEngine.shared.latestLocation,
            checks: liveSnapshot.checks,
            appendToHistory: true
        )
    }

    private func publishSnapshot(
        phase: String,
        wakeReason: String,
        monitoringMode: String,
        source: String?,
        kind: String,
        decision: String,
        reason: String,
        explanation: String,
        confidence: Double?,
        lot: Lot?,
        location: CLLocation?,
        checks: [AutoParkGateStatus],
        appendToHistory: Bool
    ) {
        let snapshot = AutoParkLiveSnapshot(
            id: UUID(),
            timestamp: Date(),
            phase: phase,
            wakeReason: wakeReason,
            monitoringMode: monitoringMode,
            triggerSource: source,
            decisionKind: kind,
            decision: decision,
            reason: reason,
            explanation: explanation,
            confidence: confidence,
            threshold: autoCommitThreshold,
            lotId: lot?.mapId ?? NativeSessionStore.shared.activeSession?.lotId,
            lotName: lot?.shortName ?? NativeSessionStore.shared.activeSession.flatMap { LotRepository.shared.byId($0.lotId)?.shortName },
            latitude: location?.coordinate.latitude,
            longitude: location?.coordinate.longitude,
            horizontalAccuracy: location?.horizontalAccuracy,
            speedMetersPerSecond: location?.speed,
            courseDegrees: location?.course,
            headingDegrees: LocationEngine.shared.latestHeading,
            locationAgeSeconds: location.map { Date().timeIntervalSince($0.timestamp) },
            cooldownRemainingSeconds: max(0, cooldown - Date().timeIntervalSince(lastDecisionAt ?? .distantPast)),
            isDriving: MotionEngine.shared.isDriving,
            activeSessionPresent: NativeSessionStore.shared.activeSession != nil,
            activeSessionLotId: NativeSessionStore.shared.activeSession?.lotId,
            hasAlwaysLocationPermission: LocationEngine.shared.hasBackgroundPermission,
            locationAuthorizationLabel: authorizationLabel(LocationEngine.shared.authorization),
            reducedAccuracy: LocationEngine.shared.accuracyAuthorization == .reducedAccuracy,
            motionAvailable: MotionEngine.shared.isAvailable,
            motionAuthorized: MotionEngine.shared.authorizationStatus == .authorized,
            lastAudioDisconnectSecondsAgo: AudioRouteEngine.shared.lastDisconnectAt.map { Date().timeIntervalSince($0) },
            lastAudioReconnectSecondsAgo: AudioRouteEngine.shared.lastReconnectAt.map { Date().timeIntervalSince($0) },
            queueDepth: OfflineQueue.shared.pendingCount,
            queueTypes: OfflineQueue.shared.pendingTypes,
            queueEndpoints: OfflineQueue.shared.pendingEndpoints,
            sessionTruthSource: NativeSessionStore.shared.truthSource.rawValue,
            lastFailure: persistedState.lastFailure ?? NativeSessionStore.shared.lastError,
            checks: checks
        )
        liveSnapshot = snapshot
        if kind == "start" {
            lastStartSnapshot = snapshot
        } else {
            lastEndSnapshot = snapshot
        }
        if appendToHistory {
            decisionHistory.insert(snapshot, at: 0)
            if decisionHistory.count > maxHistory {
                decisionHistory = Array(decisionHistory.prefix(maxHistory))
            }
        }
    }

    private func currentMonitoringMode() -> String {
        if NativeSessionStore.shared.activeSession != nil && driveAwayStartAt != nil {
            return "drive_away_watch"
        }
        if LocationEngine.shared.isTransientUpdating {
            return "escalated"
        }
        if NativeSessionStore.shared.activeSession != nil {
            return "parked"
        }
        if LocationEngine.shared.isPassiveMonitoring {
            return "idle"
        }
        return "idle"
    }

    private func stableStartIdempotencyKey(lotId: String) -> String {
        let bucket = Int(Date().timeIntervalSince1970 / 300)
        return "autopark_\(lotId)_\(bucket)"
    }

    private func stableEndIdempotencyKey() -> String {
        let lot = NativeSessionStore.shared.activeSession?.lotId ?? persistedState.lastCommittedLotId ?? "unknown"
        let bucket = Int(Date().timeIntervalSince1970 / 300)
        return "autoend_\(lot)_\(bucket)"
    }

    private func updateParkedState(from latitude: Double, longitude: Double, lotId: String) {
        persistedState.lastCommittedLotId = lotId
        persistedState.parkedLatitude = latitude
        persistedState.parkedLongitude = longitude
        persistedState.lastFailure = nil
        driveAwayStartAt = nil
        persistState()
    }

    private func clearParkedState() {
        persistedState.parkedLatitude = nil
        persistedState.parkedLongitude = nil
        persistedState.lastCommittedLotId = nil
        persistedState.lastFailure = nil
        driveAwayStartAt = nil
        persistState()
    }

    private func parkedLocation() -> CLLocation? {
        if let session = NativeSessionStore.shared.activeSession,
           let lat = session.latitude,
           let lng = session.longitude {
            return CLLocation(latitude: lat, longitude: lng)
        }
        if let lat = persistedState.parkedLatitude,
           let lng = persistedState.parkedLongitude {
            return CLLocation(latitude: lat, longitude: lng)
        }
        return nil
    }

    private func resolvedLot(for location: CLLocation?) -> Lot? {
        guard let coordinate = location?.coordinate else { return nil }
        return LotPolygonStore.lot(at: coordinate)
    }

    private func restoreState() {
        guard let data = UserDefaults.standard.data(forKey: stateKey),
              let decoded = try? JSONDecoder.iso8601.decode(PersistedState.self, from: data) else {
            return
        }
        persistedState = decoded
        currentWakeReason = decoded.lastWakeReason
    }

    private func persistState() {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        if let data = try? encoder.encode(persistedState) {
            UserDefaults.standard.set(data, forKey: stateKey)
        }
    }

    private func authorizationLabel(_ status: CLAuthorizationStatus) -> String {
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
