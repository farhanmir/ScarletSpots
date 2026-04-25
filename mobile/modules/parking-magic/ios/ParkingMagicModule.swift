import ExpoModulesCore
import CoreLocation
import CoreMotion
import AVFoundation
import ActivityKit

private struct AutoParkGateCheck: Codable {
  let key: String
  let label: String
  let passed: Bool
  let reasonCode: String?
  let detail: String?
  let rawValue: String?
}

private struct AutoParkLiveSnapshot: Codable {
  let timestamp: Double
  let source: String
  let decisionStatus: String
  let decisionReasonCode: String
  let speedMps: Double?
  let horizontalAccuracy: Double?
  let locationAgeMs: Double?
  let cooldownRemainingMs: Double
  let hasActiveAutoSession: Bool
  let isParkingEventInFlight: Bool
  let lotFound: Bool
  let lotId: String?
  let lotName: String?
  let triggerRecognized: Bool
  let checks: [AutoParkGateCheck]
}

private struct StartupDiagnosticsSnapshot: Codable {
  let timestampMs: Double
  let isSensing: Bool
  let permissionStatus: String
  let locationServicesEnabled: Bool
  let motionActivityAvailable: Bool
  let routeObserverAttached: Bool
  let vultureObserverAttached: Bool
  let hasConfiguredNetwork: Bool
  let hasUserPermit: Bool
  let hasOwnerId: Bool
  let hasActiveAutoSession: Bool
  let pendingEventSource: String?
}

private struct CapabilityStatusSnapshot: Codable {
  let ok: Bool
  let reasons: [String]
  let backgroundLocationOk: Bool
  let motionOk: Bool
}

public class ParkingMagicModule: Module {
  private let locationManager = CLLocationManager()
  private lazy var locationDelegateProxy = LocationDelegateProxy(owner: self)
  private let motionManager = CMMotionActivityManager()
  private let userDefaults = UserDefaults.standard
  private let activeAutoSessionKey = "com.scarletspots.parkingmagic.activeAutoSession"
  private let diagnosticsHistoryKey = "com.scarletspots.parkingmagic.autoparkDiagnosticsHistory"
  private let diagnosticsHistoryLimit = 100
  private let maxLocationAgeMs: Double = 45_000
  private let allowedAutoStartSources: Set<String> = [
    "bluetooth_disconnect",
    "carplay_disconnect",
    "motion_activity",
    "significant_location"
  ]
  private var isSensing = false
  private var userPermit: String?
  private var hasActiveAutoSession = false
  private var isParkingEventInFlight = false
  private var isEndingSession = false
  private var lastParkingEventAt: Date?
  private let parkingEventCooldown: TimeInterval = 15
  private let maxArrivalSpeedMps: Double = 6.0
  private let minArrivalAccuracyMeters: Double = 80.0
  private let motionTransitionWindow: TimeInterval = 180
  private let fallbackDepartureDistanceMeters: Double = 300
  private let fallbackDepartureSpeedMps: Double = 8.0
  private let fallbackDepartureDuration: TimeInterval = 90
  private var lastAutomotiveTransitionAt: Date?
  private var lastMotionConfidence: CMMotionActivityConfidence = .low
  private var parkedLocation: CLLocation?
  private var drivingAwayStartAt: Date?
  private var currentOwnerId: String?
  private var activeSessionLotId: String?
  private var activeSessionStartedAt: Date?
  private var diagnosticsHistory: [AutoParkLiveSnapshot] = []
  private var latestDiagnosticsSnapshot: AutoParkLiveSnapshot?
  private var permissionPromise: Promise?
  private var routeChangeObserver: NSObjectProtocol?
  private var vultureObserver: NSObjectProtocol?
  
  private func onMain(_ work: @escaping () -> Void) {
    if Thread.isMainThread {
      work()
    } else {
      DispatchQueue.main.async(execute: work)
    }
  }

  private func isValidCoordinate(latitude: Double, longitude: Double) -> Bool {
    return latitude.isFinite &&
      longitude.isFinite &&
      (-90.0...90.0).contains(latitude) &&
      (-180.0...180.0).contains(longitude)
  }
  
  public func definition() -> ModuleDefinition {
    Name("ParkingMagic")

    Events("onParkingEvent", "onAutoParkDiagnostics", "onSessionStateChanged")

    OnCreate {
      locationManager.delegate = locationDelegateProxy
      locationManager.pausesLocationUpdatesAutomatically = false
      hasActiveAutoSession = userDefaults.bool(forKey: activeAutoSessionKey)
      self.loadDiagnosticsHistory()
    }

    Function("syncUserData") { (url: String, token: String, permit: String, pinnedCertHashes: [String], ownerId: String) in
      self.userPermit = permit
      self.currentOwnerId = ownerId.isEmpty ? nil : ownerId
      NetworkManager.shared.configure(url: url, token: token, pinnedCertHashes: pinnedCertHashes)
      OfflineQueueManager.shared.configureOwner(self.currentOwnerId)
      self.reconcileActiveSessionFromServer()
      // Prime the offline queue flush on sync
      OfflineQueueManager.shared.flushQueue { event in
        self.setActiveAutoSession(true)
        self.parkedLocation = CLLocation(latitude: event.latitude, longitude: event.longitude)
        self.drivingAwayStartAt = nil
      }
      print("[ParkingMagic] Synced user data. Permit: \(permit)")
    }

    Function("resetUserData") {
      self.userPermit = nil
      self.currentOwnerId = nil
      NetworkManager.shared.reset()
      VultureManager.shared.reset()
      OfflineQueueManager.shared.clear()
      self.setActiveAutoSession(false)
      self.parkedLocation = nil
      self.drivingAwayStartAt = nil
      self.activeSessionLotId = nil
      self.activeSessionStartedAt = nil
      self.emitSessionStateChange(reason: "reset_user_data")
      print("[ParkingMagic] User data and state purged.")
    }

    AsyncFunction("requestPermissionsAsync") { (promise: Promise) in
      self.onMain {
        let status = CLLocationManager.authorizationStatus()
        if status == .authorizedAlways {
          promise.resolve(true)
          return
        }
        self.permissionPromise = promise
        self.locationManager.requestAlwaysAuthorization()
      }
    }

    Function("startSensing") {
      self.onMain {
        guard !self.isSensing else { return }
        self.isSensing = true

        // 1. Monitor Significant Locations (App Anchor) only when permission is ready.
        self.startLocationMonitoringIfAuthorized()

        // 2. Monitor Audio Route (BT/CarPlay)
        self.routeChangeObserver = NotificationCenter.default.addObserver(
          forName: AVAudioSession.routeChangeNotification,
          object: nil,
          queue: .main
        ) { [weak self] notification in
          self?.handleRouteChange(notification: notification)
        }
        self.vultureObserver = NotificationCenter.default.addObserver(
          forName: .vultureDetected,
          object: nil,
          queue: .main
        ) { [weak self] notification in
          self?.handleVulture(notification: notification)
        }

        // 3. Monitor Motion (Automotive -> Walking)
        self.startMotionUpdates()
      }
    }

    Function("stopSensing") {
      self.onMain {
        self.isSensing = false
        self.pendingEventSource = nil
        self.isParkingEventInFlight = false
        self.isEndingSession = false
        self.lastParkingEventAt = nil
        self.locationManager.stopMonitoringSignificantLocationChanges()
        if let routeChangeObserver = self.routeChangeObserver {
          NotificationCenter.default.removeObserver(routeChangeObserver)
          self.routeChangeObserver = nil
        }
        if let vultureObserver = self.vultureObserver {
          NotificationCenter.default.removeObserver(vultureObserver)
          self.vultureObserver = nil
        }
        self.motionManager.stopActivityUpdates()
      }
    }

    AsyncFunction("getSystemHealthAsync") { (promise: Promise) in
      let backgroundLocationOk = CLLocationManager.authorizationStatus() == .authorizedAlways
      let preciseLocationOk = locationManager.accuracyAuthorization == .fullAccuracy
      let motionOk = CMMotionActivityManager.isActivityAvailable()
      
      let audioSession = AVAudioSession.sharedInstance()
      let bluetoothOk = audioSession.currentRoute.outputs.contains { $0.portType == .bluetoothA2DP || $0.portType == .bluetoothLE || $0.portType == .bluetoothHFP }
      
      let ok = backgroundLocationOk && motionOk
      
      var reasons: [String] = []
      if !backgroundLocationOk { reasons.append("location_background_missing") }
      if !preciseLocationOk { reasons.append("location_reduced_accuracy") }
      if !motionOk { reasons.append("motion_activity_unavailable") }
      
      let status: [String: Any] = [
        "ok": ok,
        "reasons": reasons,
        "backgroundLocationOk": backgroundLocationOk,
        "preciseLocationOk": preciseLocationOk,
        "motionOk": motionOk,
        "bluetoothOk": bluetoothOk
      ]
      promise.resolve(status)
    }

    AsyncFunction("getCapabilityStatusAsync") { (promise: Promise) in
      promise.resolve(self.buildCapabilityStatus())
    }

    AsyncFunction("getStartupDiagnosticsAsync") { (promise: Promise) in
      promise.resolve(self.buildStartupDiagnostics())
    }

    AsyncFunction("getNativeSessionStateAsync") { (promise: Promise) in
      promise.resolve([
        "activeAutoSession": self.hasActiveAutoSession,
        "isParkingEventInFlight": self.isParkingEventInFlight,
        "isEndingSession": self.isEndingSession,
        "pendingEventSource": self.pendingEventSource as Any,
      ])
    }

    AsyncFunction("getActiveParkingSessionAsync") { (promise: Promise) in
      NetworkManager.shared.fetchActiveParkingSession { status in
        guard let status = status else {
          promise.resolve(["success": false, "session": NSNull()])
          return
        }

        if status.isActive {
          let resolvedLotId = status.lotId ?? "unknown"
          promise.resolve([
            "success": true,
            "session": self.buildSessionPayload(
              lotId: resolvedLotId,
              latitude: status.latitude,
              longitude: status.longitude,
              autoStarted: true
            )
          ])
        } else {
          promise.resolve(["success": true, "session": NSNull()])
        }
      }
    }

    AsyncFunction("getSessionStateAsync") { (promise: Promise) in
      promise.resolve(self.buildSessionStatePayload())
    }

    AsyncFunction("refreshSessionStateAsync") { (promise: Promise) in
      NetworkManager.shared.fetchActiveParkingSession { status in
        self.onMain {
          guard let status else {
            promise.resolve(self.buildSessionStatePayload())
            return
          }

          self.setActiveAutoSession(status.isActive)
          if status.isActive {
            self.activeSessionLotId = status.lotId
            if self.activeSessionStartedAt == nil {
              self.activeSessionStartedAt = Date()
            }
            if let latitude = status.latitude, let longitude = status.longitude {
              self.parkedLocation = CLLocation(latitude: latitude, longitude: longitude)
            }
          } else {
            self.activeSessionLotId = nil
            self.activeSessionStartedAt = nil
            self.parkedLocation = nil
            self.drivingAwayStartAt = nil
          }
          self.emitSessionStateChange(reason: "refresh_session_state")
          promise.resolve(self.buildSessionStatePayload())
        }
      }
    }

    AsyncFunction("startParkingSessionAsync") { (
      lotId: String,
      latitude: Double,
      longitude: Double,
      autoStarted: Bool,
      source: String,
      promise: Promise
    ) in
      let idempotencyKey = "native_manual_park_\(Int(Date().timeIntervalSince1970 * 1000))_\(UUID().uuidString)"
      NetworkManager.shared.submitParkingEvent(
        lotId: lotId,
        latitude: latitude,
        longitude: longitude,
        source: source,
        autoStarted: autoStarted,
        idempotencyKey: idempotencyKey
      ) { success, eventId, retryable in
        self.onMain {
          if success {
            self.setActiveAutoSession(true)
            self.activeSessionLotId = lotId
            self.activeSessionStartedAt = Date()
            self.parkedLocation = CLLocation(latitude: latitude, longitude: longitude)
            self.drivingAwayStartAt = nil
            self.emitSessionStateChange(reason: "start_session")
            promise.resolve([
              "success": true,
              "_offline": false,
              "session": self.buildSessionPayload(
                lotId: lotId,
                latitude: latitude,
                longitude: longitude,
                autoStarted: autoStarted
              )
            ])
            return
          }

          let queuedEvent = PendingEvent(
            id: eventId ?? UUID().uuidString,
            ownerId: self.currentOwnerId,
            latitude: latitude,
            longitude: longitude,
            source: source,
            timestamp: Date().timeIntervalSince1970,
            lotId: lotId,
            idempotencyKey: idempotencyKey
          )
          if retryable {
            OfflineQueueManager.shared.enqueue(event: queuedEvent)
            self.setActiveAutoSession(true)
            self.activeSessionLotId = lotId
            self.activeSessionStartedAt = Date()
            self.parkedLocation = CLLocation(latitude: latitude, longitude: longitude)
            self.drivingAwayStartAt = nil
            self.emitSessionStateChange(reason: "start_session_offline")
            promise.resolve([
              "success": true,
              "_offline": true,
              "session": self.buildSessionPayload(
                lotId: lotId,
                latitude: latitude,
                longitude: longitude,
                autoStarted: autoStarted
              )
            ])
          } else {
            promise.resolve([
              "success": false,
              "_offline": false,
              "error": "server_rejected",
              "session": NSNull()
            ])
          }
        }
      }
    }

    AsyncFunction("endParkingSessionAsync") { (promise: Promise) in
      NetworkManager.shared.endParkingSession { success in
        self.onMain {
          if success {
            self.lastParkingEventAt = nil
            self.setActiveAutoSession(false)
            self.activeSessionLotId = nil
            self.activeSessionStartedAt = nil
            self.parkedLocation = nil
            self.drivingAwayStartAt = nil
            self.emitSessionStateChange(reason: "end_session")
            if #available(iOS 16.2, *) {
              LiveActivityManager.shared.stopActivity()
            }
            promise.resolve(["success": true, "_offline": false])
          } else {
            promise.resolve(["success": false, "_offline": true])
          }
        }
      }
    }

    AsyncFunction("getAutoParkDiagnosticsAsync") { (promise: Promise) in
      promise.resolve([
        "latest": self.latestDiagnosticsSnapshot.map { self.dictionary(from: $0) } ?? NSNull(),
        "history": self.diagnosticsHistory.map { self.dictionary(from: $0) }
      ])
    }

    AsyncFunction("getAutoParkDiagnosticsSummaryAsync") { (promise: Promise) in
      promise.resolve(self.buildDiagnosticsSummary())
    }

    AsyncFunction("clearAutoParkDiagnosticsAsync") { (promise: Promise) in
      self.diagnosticsHistory = []
      self.latestDiagnosticsSnapshot = nil
      self.userDefaults.removeObject(forKey: self.diagnosticsHistoryKey)
      promise.resolve(true)
    }

    AsyncFunction("runAutoParkSmokeTestAsync") { (latitude: Double, longitude: Double, promise: Promise) in
      guard self.isValidCoordinate(latitude: latitude, longitude: longitude) else {
        promise.resolve([
          "ok": false,
          "startSuccess": false,
          "endSuccess": false,
          "activeAfter": self.hasActiveAutoSession,
          "error": "invalid_coordinate"
        ])
        return
      }

      let location = CLLocation(
        coordinate: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
        altitude: 0,
        horizontalAccuracy: 8,
        verticalAccuracy: 12,
        course: 0,
        speed: 1.1,
        timestamp: Date()
      )
      let previousState = self.hasActiveAutoSession

      if self.hasActiveAutoSession {
        self.setActiveAutoSession(false)
      }

      self._dispatchParkingEvent(source: "bluetooth_disconnect", location: location) { startSuccess in
        if !startSuccess {
          self.setActiveAutoSession(previousState)
          promise.resolve([
            "ok": false,
            "startSuccess": false,
            "endSuccess": false,
            "activeAfter": self.hasActiveAutoSession,
            "error": "start_failed"
          ])
          return
        }

        self.isEndingSession = true
        NetworkManager.shared.endParkingSession { endSuccess in
          self.isEndingSession = false

          if endSuccess {
            self.lastParkingEventAt = nil
            self.setActiveAutoSession(false)
            if #available(iOS 16.2, *) {
              LiveActivityManager.shared.stopActivity()
            }
          } else {
            self.setActiveAutoSession(previousState)
          }

          promise.resolve([
            "ok": startSuccess && endSuccess,
            "startSuccess": startSuccess,
            "endSuccess": endSuccess,
            "activeAfter": self.hasActiveAutoSession,
            "error": endSuccess ? (NSNull() as Any) : ("end_failed" as Any)
          ])
        }
      }
    }

    AsyncFunction("resolveLotAtAsync") { (latitude: Double, longitude: Double, promise: Promise) in
      guard self.isValidCoordinate(latitude: latitude, longitude: longitude) else {
        promise.resolve([
          "found": false,
          "lotId": NSNull(),
          "lotName": NSNull()
        ])
        return
      }
      let coordinate = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
      if let lot = DatabaseManager.shared.getLotAt(coordinate: coordinate) {
        promise.resolve([
          "found": true,
          "lotId": lot.id,
          "lotName": lot.name
        ])
      } else {
        promise.resolve([
          "found": false,
          "lotId": NSNull(),
          "lotName": NSNull()
        ])
      }
    }

    AsyncFunction("getLotPolygonsAsync") { (promise: Promise) in
      let polygons = DatabaseManager.shared.getAllLotPolygons().map { lot in
        [
          "id": lot.id,
          "name": lot.name,
          "rings": lot.rings.map { ring in
            ring.map { point in
              ["lat": point.latitude, "lng": point.longitude]
            }
          }
        ]
      }
      promise.resolve(polygons)
    }

    View(ScarletMapView.self) {
      Prop("selectedLotId") { (view: ScarletMapView, prop: String?) in
        view.setSelectedLot(prop)
      }
      Events("onLotPress")
    }
  }

  // MARK: - Motion Sensing
  private func authorizationStatusString(_ status: CLAuthorizationStatus) -> String {
    switch status {
    case .notDetermined:
      return "not_determined"
    case .restricted:
      return "restricted"
    case .denied:
      return "denied"
    case .authorizedWhenInUse:
      return "authorized_when_in_use"
    case .authorizedAlways:
      return "authorized_always"
    @unknown default:
      return "unknown"
    }
  }

  private func buildStartupDiagnostics() -> [String: Any] {
    let status = CLLocationManager.authorizationStatus()
    let snapshot = StartupDiagnosticsSnapshot(
      timestampMs: Date().timeIntervalSince1970 * 1000,
      isSensing: isSensing,
      permissionStatus: authorizationStatusString(status),
      locationServicesEnabled: CLLocationManager.locationServicesEnabled(),
      motionActivityAvailable: CMMotionActivityManager.isActivityAvailable(),
      routeObserverAttached: routeChangeObserver != nil,
      vultureObserverAttached: vultureObserver != nil,
      hasConfiguredNetwork: NetworkManager.shared.isConfigured,
      hasUserPermit: userPermit?.isEmpty == false,
      hasOwnerId: currentOwnerId?.isEmpty == false,
      hasActiveAutoSession: hasActiveAutoSession,
      pendingEventSource: pendingEventSource
    )

    return [
      "timestampMs": snapshot.timestampMs,
      "isSensing": snapshot.isSensing,
      "permissionStatus": snapshot.permissionStatus,
      "locationServicesEnabled": snapshot.locationServicesEnabled,
      "motionActivityAvailable": snapshot.motionActivityAvailable,
      "routeObserverAttached": snapshot.routeObserverAttached,
      "vultureObserverAttached": snapshot.vultureObserverAttached,
      "hasConfiguredNetwork": snapshot.hasConfiguredNetwork,
      "hasUserPermit": snapshot.hasUserPermit,
      "hasOwnerId": snapshot.hasOwnerId,
      "hasActiveAutoSession": snapshot.hasActiveAutoSession,
      "pendingEventSource": snapshot.pendingEventSource as Any
    ]
  }

  private func buildCapabilityStatus() -> [String: Any] {
    let fgStatus = CLLocationManager.authorizationStatus()
    let preciseLocationOk = locationManager.accuracyAuthorization == .fullAccuracy
    let motionOk = CMMotionActivityManager.isActivityAvailable()

    var reasons: [String] = []
    if fgStatus == .notDetermined || fgStatus == .denied || fgStatus == .restricted {
      reasons.append("location_foreground")
    }
    if fgStatus != .authorizedAlways {
      reasons.append("location_background")
    }
    if !preciseLocationOk {
      reasons.append("location_imprecise")
    }
    if !motionOk {
      reasons.append("motion")
    }

    let backgroundLocationOk = fgStatus == .authorizedAlways && preciseLocationOk
    let snapshot = CapabilityStatusSnapshot(
      ok: backgroundLocationOk && motionOk,
      reasons: reasons,
      backgroundLocationOk: backgroundLocationOk,
      motionOk: motionOk
    )

    return [
      "ok": snapshot.ok,
      "reasons": snapshot.reasons,
      "backgroundLocationOk": snapshot.backgroundLocationOk,
      "motionOk": snapshot.motionOk
    ]
  }

  private func buildSessionStatePayload() -> [String: Any] {
    let sessionPayload: [String: Any]
    if hasActiveAutoSession {
      let lotId = activeSessionLotId ?? "unknown"
      sessionPayload = buildSessionPayload(
        lotId: lotId,
        latitude: parkedLocation?.coordinate.latitude,
        longitude: parkedLocation?.coordinate.longitude,
        autoStarted: true
      )
    } else {
      sessionPayload = [:]
    }

    return [
      "activeAutoSession": hasActiveAutoSession,
      "session": hasActiveAutoSession ? sessionPayload : NSNull()
    ]
  }

  private func emitSessionStateChange(reason: String) {
    onMain {
      var payload = self.buildSessionStatePayload()
      payload["reason"] = reason
      self.sendEvent("onSessionStateChanged", payload)
    }
  }

  private func canUseAlwaysBackgroundLocation(_ status: CLAuthorizationStatus) -> Bool {
    return status == .authorizedAlways
  }

  private func configureBackgroundLocationIfNeeded() {
    if #available(iOS 9.0, *) {
      locationManager.allowsBackgroundLocationUpdates = true
    }
    locationManager.pausesLocationUpdatesAutomatically = false
  }

  private func startLocationMonitoringIfAuthorized() {
    let status = CLLocationManager.authorizationStatus()
    guard canUseAlwaysBackgroundLocation(status) else {
      print("[ParkingMagic] Skipping significant location monitoring: authorization is \(status.rawValue)")
      return
    }
    configureBackgroundLocationIfNeeded()
    locationManager.startMonitoringSignificantLocationChanges()
  }

  private func startMotionUpdates() {
    guard CMMotionActivityManager.isActivityAvailable() else { return }
    
    var lastWasAutomotive = false
    
    motionManager.startActivityUpdates(to: .main) { [weak self] activity in
      guard let self = self, let activity = activity else { return }
      
      if activity.automotive {
        lastWasAutomotive = true
        self.lastAutomotiveTransitionAt = Date()
        self.lastMotionConfidence = activity.confidence
      } else if (activity.walking || activity.stationary) && lastWasAutomotive {
        // Detected transition from driving to walking/standing
        lastWasAutomotive = false
        self.lastMotionConfidence = activity.confidence
        self.emitParkingEvent(source: "motion_activity")
      }
    }
  }

  // MARK: - Event Emission
  // Store the pending trigger so we can emit once didUpdateLocations delivers a fix.
  private var pendingEventSource: String?

  private func emitParkingEvent(source: String) {
    if hasActiveAutoSession {
      if let location = locationManager.location {
        let snapshot = buildArrivalDiagnostics(
          source: source,
          location: location,
          lotId: nil,
          lotName: nil,
          decisionStatus: "blocked",
          decisionReasonCode: "active_session_exists"
        )
        publishDiagnostics(snapshot)
      } else {
        publishNoLocationBlockedSnapshot(
          source: source,
          reasonCode: "active_session_exists",
          detail: "auto session already active"
        )
      }
      return
    }

    let now = Date()
    if isParkingEventInFlight {
      publishNoLocationBlockedSnapshot(
        source: source,
        reasonCode: "event_in_flight",
        detail: "another parking event is currently being processed"
      )
      return
    }
    if let lastParkingEventAt, now.timeIntervalSince(lastParkingEventAt) < parkingEventCooldown {
      let remainingMs = Int((parkingEventCooldown - now.timeIntervalSince(lastParkingEventAt)) * 1000)
      publishNoLocationBlockedSnapshot(
        source: source,
        reasonCode: "cooldown_active",
        detail: "\(remainingMs)ms remaining in cooldown"
      )
      return
    }

    // If we already have a cached fix, fire immediately.
    if let location = locationManager.location {
      isParkingEventInFlight = true
      _dispatchParkingEvent(source: source, location: location)
      return
    }
    // No cached fix — request one and fire when it arrives.
    pendingEventSource = source
    isParkingEventInFlight = true
    locationManager.requestLocation()
  }

  private func setActiveAutoSession(_ active: Bool) {
    hasActiveAutoSession = active
    userDefaults.set(active, forKey: activeAutoSessionKey)
  }

  private func loadDiagnosticsHistory() {
    guard let data = userDefaults.data(forKey: diagnosticsHistoryKey),
          let decoded = try? JSONDecoder().decode([AutoParkLiveSnapshot].self, from: data) else {
      diagnosticsHistory = []
      latestDiagnosticsSnapshot = nil
      return
    }
    diagnosticsHistory = Array(decoded.suffix(diagnosticsHistoryLimit))
    latestDiagnosticsSnapshot = diagnosticsHistory.last
  }

  private func persistDiagnosticsHistory() {
    guard let data = try? JSONEncoder().encode(diagnosticsHistory) else { return }
    userDefaults.set(data, forKey: diagnosticsHistoryKey)
  }

  private func dictionary(from check: AutoParkGateCheck) -> [String: Any] {
    return [
      "key": check.key,
      "label": check.label,
      "passed": check.passed,
      "reasonCode": check.reasonCode as Any,
      "detail": check.detail as Any,
      "rawValue": check.rawValue as Any
    ]
  }

  private func dictionary(from snapshot: AutoParkLiveSnapshot) -> [String: Any] {
    return [
      "timestamp": snapshot.timestamp,
      "source": snapshot.source,
      "decisionStatus": snapshot.decisionStatus,
      "decisionReasonCode": snapshot.decisionReasonCode,
      "speedMps": snapshot.speedMps as Any,
      "horizontalAccuracy": snapshot.horizontalAccuracy as Any,
      "locationAgeMs": snapshot.locationAgeMs as Any,
      "cooldownRemainingMs": snapshot.cooldownRemainingMs,
      "hasActiveAutoSession": snapshot.hasActiveAutoSession,
      "isParkingEventInFlight": snapshot.isParkingEventInFlight,
      "lotFound": snapshot.lotFound,
      "lotId": snapshot.lotId as Any,
      "lotName": snapshot.lotName as Any,
      "triggerRecognized": snapshot.triggerRecognized,
      "checks": snapshot.checks.map { dictionary(from: $0) }
    ]
  }

  private func publishDiagnostics(_ snapshot: AutoParkLiveSnapshot) {
    latestDiagnosticsSnapshot = snapshot
    diagnosticsHistory.append(snapshot)
    diagnosticsHistory = Array(diagnosticsHistory.suffix(diagnosticsHistoryLimit))
    persistDiagnosticsHistory()
    onMain {
      var payload = self.dictionary(from: snapshot)
      if snapshot.decisionStatus == "ready" {
        payload["checks"] = [] as [[String: Any]]
      }
      self.sendEvent("onAutoParkDiagnostics", payload)
    }
  }

  private func buildDiagnosticsSummary() -> [String: Any] {
    let history = diagnosticsHistory
    let total = history.count
    let started = history.filter { $0.decisionStatus == "started" }.count
    let blocked = history.filter { $0.decisionStatus == "blocked" }.count
    let ready = history.filter { $0.decisionStatus == "ready" }.count

    var blockedReasons: [String: Int] = [:]
    var failedChecks: [String: Int] = [:]

    for snapshot in history where snapshot.decisionStatus == "blocked" {
      blockedReasons[snapshot.decisionReasonCode, default: 0] += 1
      for check in snapshot.checks where !check.passed {
        failedChecks[check.key, default: 0] += 1
      }
    }

    let topBlockedReasons = blockedReasons
      .sorted { lhs, rhs in
        if lhs.value == rhs.value { return lhs.key < rhs.key }
        return lhs.value > rhs.value
      }
      .prefix(5)
      .map { ["reasonCode": $0.key, "count": $0.value] }

    let topFailedChecks = failedChecks
      .sorted { lhs, rhs in
        if lhs.value == rhs.value { return lhs.key < rhs.key }
        return lhs.value > rhs.value
      }
      .prefix(5)
      .map { ["checkKey": $0.key, "count": $0.value] }

    return [
      "totalSnapshots": total,
      "startedCount": started,
      "blockedCount": blocked,
      "readyCount": ready,
      "startRate": total > 0 ? Double(started) / Double(total) : 0,
      "topBlockedReasons": topBlockedReasons,
      "topFailedChecks": topFailedChecks
    ]
  }

  private func buildSessionPayload(
    lotId: String,
    latitude: Double?,
    longitude: Double?,
    autoStarted: Bool
  ) -> [String: Any] {
    let resolvedStartedAt = activeSessionStartedAt ?? Date()
    return [
      "id": "native-\(UUID().uuidString)",
      "lotId": lotId,
      "startTime": ISO8601DateFormatter().string(from: resolvedStartedAt),
      "latitude": latitude as Any,
      "longitude": longitude as Any,
      "autoStarted": autoStarted
    ]
  }

  private func makeGateCheck(
    key: String,
    label: String,
    passed: Bool,
    reasonCode: String? = nil,
    detail: String? = nil,
    rawValue: String? = nil
  ) -> AutoParkGateCheck {
    AutoParkGateCheck(
      key: key,
      label: label,
      passed: passed,
      reasonCode: passed ? nil : reasonCode,
      detail: detail,
      rawValue: rawValue
    )
  }

  private func publishNoLocationBlockedSnapshot(source: String, reasonCode: String, detail: String) {
    let snapshot = AutoParkLiveSnapshot(
      timestamp: Date().timeIntervalSince1970 * 1000,
      source: source,
      decisionStatus: "blocked",
      decisionReasonCode: reasonCode,
      speedMps: nil,
      horizontalAccuracy: nil,
      locationAgeMs: nil,
      cooldownRemainingMs: 0,
      hasActiveAutoSession: hasActiveAutoSession,
      isParkingEventInFlight: isParkingEventInFlight,
      lotFound: false,
      lotId: nil,
      lotName: nil,
      triggerRecognized: allowedAutoStartSources.contains(source),
      checks: [
        makeGateCheck(
          key: reasonCode,
          label: "Dispatch blocked",
          passed: false,
          reasonCode: reasonCode,
          detail: detail
        )
      ]
    )
    publishDiagnostics(snapshot)
  }

  private func reconcileActiveSessionFromServer() {
    NetworkManager.shared.fetchActiveParkingSession { status in
      guard let status = status else { return }
      self.onMain {
        self.setActiveAutoSession(status.isActive)
        if status.isActive,
           let latitude = status.latitude,
           let longitude = status.longitude {
          self.activeSessionLotId = status.lotId
          if self.activeSessionStartedAt == nil {
            self.activeSessionStartedAt = Date()
          }
          self.parkedLocation = CLLocation(latitude: latitude, longitude: longitude)
        }
        if !status.isActive {
          self.activeSessionLotId = nil
          self.activeSessionStartedAt = nil
          self.parkedLocation = nil
          self.drivingAwayStartAt = nil
        }
        self.emitSessionStateChange(reason: "reconcile_active_session")
      }
    } 
  }

  private func buildArrivalDiagnostics(
    source: String,
    location: CLLocation,
    lotId: String?,
    lotName: String?,
    decisionStatus: String,
    decisionReasonCode: String
  ) -> AutoParkLiveSnapshot {
    let now = Date()
    let accuracy = location.horizontalAccuracy
    let speed = location.speed >= 0 ? location.speed : nil
    let locationAgeMs = max(0, now.timeIntervalSince(location.timestamp) * 1000)
    let cooldownRemainingMs: Double
    if let lastParkingEventAt {
      let remaining = parkingEventCooldown - now.timeIntervalSince(lastParkingEventAt)
      cooldownRemainingMs = max(0, remaining * 1000)
    } else {
      cooldownRemainingMs = 0
    }

    let triggerRecognized = allowedAutoStartSources.contains(source)
    let lotFound = lotId != nil
    let isLocationFresh = locationAgeMs <= maxLocationAgeMs
    let hasGoodAccuracy = accuracy >= 0 && accuracy <= minArrivalAccuracyMeters
    let hasArrivalSpeed = speed == nil || speed! <= maxArrivalSpeedMps

    let motionTransitionValid: Bool
    if source == "motion_activity" {
      motionTransitionValid = {
        guard let lastTransition = lastAutomotiveTransitionAt else { return false }
        return now.timeIntervalSince(lastTransition) <= motionTransitionWindow && lastMotionConfidence != .low
      }()
    } else {
      motionTransitionValid = true
    }

    let checks: [AutoParkGateCheck] = [
      makeGateCheck(
        key: "trigger_source",
        label: "Trigger recognized",
        passed: triggerRecognized,
        reasonCode: "unrecognized_trigger_source",
        detail: source,
        rawValue: source
      ),
      makeGateCheck(
        key: "active_session",
        label: "No active auto session",
        passed: !hasActiveAutoSession,
        reasonCode: "active_session_exists",
        detail: hasActiveAutoSession ? "session already active" : "idle",
        rawValue: hasActiveAutoSession ? "active" : "idle"
      ),
      makeGateCheck(
        key: "event_in_flight",
        label: "Dispatch lock acquired",
        passed: true,
        detail: "current event owns lock",
        rawValue: isParkingEventInFlight ? "owned" : "not_owned"
      ),
      makeGateCheck(
        key: "cooldown",
        label: "Cooldown elapsed",
        passed: cooldownRemainingMs <= 0.0,
        reasonCode: "cooldown_active",
        detail: cooldownRemainingMs > 0 ? "\(Int(cooldownRemainingMs))ms remaining" : "ready",
        rawValue: String(Int(cooldownRemainingMs))
      ),
      makeGateCheck(
        key: "location_freshness",
        label: "Location freshness",
        passed: isLocationFresh,
        reasonCode: "stale_location",
        detail: "\(Int(locationAgeMs))ms old",
        rawValue: String(Int(locationAgeMs))
      ),
      makeGateCheck(
        key: "gps_accuracy",
        label: "GPS accuracy",
        passed: hasGoodAccuracy,
        reasonCode: "poor_gps_accuracy",
        detail: "threshold \(Int(minArrivalAccuracyMeters))m",
        rawValue: String(format: "%.1f", accuracy)
      ),
      makeGateCheck(
        key: "arrival_speed",
        label: "Arrival speed",
        passed: hasArrivalSpeed,
        reasonCode: "speed_too_high",
        detail: "max \(String(format: "%.1f", maxArrivalSpeedMps))m/s",
        rawValue: speed != nil ? String(format: "%.2f", speed!) : "unknown"
      ),
      makeGateCheck(
        key: "lot_match",
        label: "Inside known lot",
        passed: lotFound,
        reasonCode: "lot_not_resolved",
        detail: lotName ?? "Unknown lot",
        rawValue: lotId ?? "unknown"
      ),
      makeGateCheck(
        key: "motion_transition",
        label: "Motion transition valid",
        passed: motionTransitionValid,
        reasonCode: "motion_transition_missing",
        detail: source == "motion_activity" ? "requires recent automotive -> walk transition" : "not required for this trigger",
        rawValue: source == "motion_activity" ? "\(lastMotionConfidence.rawValue)" : "n/a"
      )
    ]

    return AutoParkLiveSnapshot(
      timestamp: now.timeIntervalSince1970 * 1000,
      source: source,
      decisionStatus: decisionStatus,
      decisionReasonCode: decisionReasonCode,
      speedMps: speed,
      horizontalAccuracy: accuracy >= 0 ? accuracy : nil,
      locationAgeMs: locationAgeMs,
      cooldownRemainingMs: cooldownRemainingMs,
      hasActiveAutoSession: hasActiveAutoSession,
      isParkingEventInFlight: isParkingEventInFlight,
      lotFound: lotFound,
      lotId: lotId,
      lotName: lotName,
      triggerRecognized: triggerRecognized,
      checks: checks
    )
  }

  private func endAutoSession(reason: String) {
    guard !isEndingSession else { return }
    isEndingSession = true
    print("[ParkingMagic] Ending auto-session via \(reason)")
    NetworkManager.shared.endParkingSession { success in
      self.onMain {
        self.isEndingSession = false
        if success {
          self.lastParkingEventAt = nil
          self.setActiveAutoSession(false)
          self.activeSessionLotId = nil
          self.activeSessionStartedAt = nil
          self.parkedLocation = nil
          self.drivingAwayStartAt = nil
          self.emitSessionStateChange(reason: "auto_session_ended")
          if #available(iOS 16.2, *) {
            LiveActivityManager.shared.stopActivity()
          }
        }
      }
    }
  }

  private func evaluateFallbackDeparture(location: CLLocation) {
    guard hasActiveAutoSession,
          let parkedLocation = parkedLocation else {
      drivingAwayStartAt = nil
      return
    }

    let distance = location.distance(from: parkedLocation)
    let speed = location.speed
    let drivingAway = (speed >= fallbackDepartureSpeedMps) && (distance >= fallbackDepartureDistanceMeters)

    if drivingAway {
      if drivingAwayStartAt == nil {
        drivingAwayStartAt = Date()
        return
      }

      if let drivingAwayStartAt,
         Date().timeIntervalSince(drivingAwayStartAt) >= fallbackDepartureDuration {
        endAutoSession(reason: "fallback_driveaway")
      }
    } else {
      drivingAwayStartAt = nil
    }
  }

  private func _dispatchParkingEvent(source: String, location: CLLocation, completion: ((Bool) -> Void)? = nil) {
    let coordinate = location.coordinate
    let idempotencyKey = "native_park_\(Int(Date().timeIntervalSince1970 * 1000))_\(UUID().uuidString)"
    
    // Phase 7: Resolve lotId natively
    let lot = DatabaseManager.shared.getLotAt(coordinate: coordinate)
    let lotId = lot?.id
    let lotName = lot?.name

    // Phase 4: Ticket Shield Validation
    let validation = TicketShield.shared.validateParking(
      permitType: self.userPermit ?? "Public",
      lotId: lotId ?? "unknown"
    )
    
    let readySnapshot = buildArrivalDiagnostics(
      source: source,
      location: location,
      lotId: lotId,
      lotName: lotName,
      decisionStatus: "ready",
      decisionReasonCode: "ready_to_start"
    )
    publishDiagnostics(readySnapshot)

    if let failedCheck = readySnapshot.checks.first(where: { !$0.passed }) {
      let blockedSnapshot = buildArrivalDiagnostics(
        source: source,
        location: location,
        lotId: lotId,
        lotName: lotName,
        decisionStatus: "blocked",
        decisionReasonCode: failedCheck.reasonCode ?? "blocked"
      )
      publishDiagnostics(blockedSnapshot)
      print("[ParkingMagic] Blocked sensing event \(source): \(failedCheck.reasonCode ?? "blocked")")
      isParkingEventInFlight = false
      completion?(false)
      return
    }

    print("[ParkingMagic] Sensing Event: \(source) at \(lotName ?? "Unknown Lot"). Validation: \(validation.message)")

    // Phase 8: Hard-Wired Direct Sync
    NetworkManager.shared.submitParkingEvent(
      lotId: lotId ?? "unknown",
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      source: source,
      idempotencyKey: idempotencyKey
    ) { success, eventId, retryable in
      self.onMain {
        self.isParkingEventInFlight = false
        self.lastParkingEventAt = Date()

        if success {
          self.setActiveAutoSession(true)
          self.activeSessionLotId = lotId
          self.activeSessionStartedAt = Date()
          self.parkedLocation = location
          self.drivingAwayStartAt = nil
          self.emitSessionStateChange(reason: "auto_session_started")
          let startedSnapshot = self.buildArrivalDiagnostics(
            source: source,
            location: location,
            lotId: lotId,
            lotName: lotName,
            decisionStatus: "started",
            decisionReasonCode: "session_started"
          )
          self.publishDiagnostics(startedSnapshot)
          if #available(iOS 16.2, *) {
            LiveActivityManager.shared.startParkingActivity(lotName: lotName ?? "Unknown Lot")
          }
        } else {
          let blockedSnapshot = self.buildArrivalDiagnostics(
            source: source,
            location: location,
            lotId: lotId,
            lotName: lotName,
            decisionStatus: "blocked",
            decisionReasonCode: "network_submit_failed"
          )
          self.publishDiagnostics(blockedSnapshot)
          if retryable {
            let event = PendingEvent(
              id: eventId ?? UUID().uuidString,
              ownerId: self.currentOwnerId,
              latitude: coordinate.latitude,
              longitude: coordinate.longitude,
              source: source,
              timestamp: Date().timeIntervalSince1970,
              lotId: lotId ?? "unknown",
              idempotencyKey: idempotencyKey
            )
            OfflineQueueManager.shared.enqueue(event: event)
            self.setActiveAutoSession(true)
            self.activeSessionLotId = lotId
            self.activeSessionStartedAt = Date()
            self.parkedLocation = location
            self.drivingAwayStartAt = nil
            self.emitSessionStateChange(reason: "auto_session_queued_offline")
            print("[ParkingMagic] Event queued for offline sync.")
          } else {
            print("[ParkingMagic] Non-retryable submit failure. Not queueing event.")
          }
        }

        completion?(success)
      }
    }

    // Bridge Notification (for open app)
    onMain {
      self.sendEvent("onParkingEvent", [
        "latitude": coordinate.latitude,
        "longitude": coordinate.longitude,
        "source": source,
        "lotId": lotId as Any,
        "message": validation.message,
        "timestamp": Date().timeIntervalSince1970 * 1000
      ])
    }
  }

  fileprivate func handleLocationUpdate(_ locations: [CLLocation]) {
    guard let location = locations.last else { return }
    let coordinate = location.coordinate
    
    // Phase 7: Resolve lotId natively using the PIP engine
    let lot = DatabaseManager.shared.getLotAt(coordinate: coordinate)
    let lotId = lot?.id
    
    // Phase 4: Report to VultureManager
    VultureManager.shared.reportLocation(location: location, lotId: lotId)
    
    // Fix #3: Dispatch any pending parking event that was deferred waiting for a GPS fix
    if let source = pendingEventSource {
      pendingEventSource = nil
      _dispatchParkingEvent(source: source, location: location)
    }
    
    // Phase 9: Real-time Navigation Logic (Finding Car)
    if let carLocation = UserDefaults.standard.object(forKey: "car_pin_location") as? [String: Double] {
      let carCoord = CLLocation(latitude: carLocation["lat"] ?? 0, longitude: carLocation["lng"] ?? 0)
      let distance = location.distance(from: carCoord)
      
      if distance < 50 {
        HapticManager.shared.playGuidancePulse(distance: distance)
      }
      
      if #available(iOS 16.2, *) {
        LiveActivityManager.shared.updateActivity(distance: "\(Int(distance))m")
      }
    }

    evaluateFallbackDeparture(location: location)
  }

  fileprivate func handleLocationFailure(_ error: Error) {
    if let source = pendingEventSource {
      publishNoLocationBlockedSnapshot(
        source: source,
        reasonCode: "location_unavailable",
        detail: error.localizedDescription
      )
    }
    pendingEventSource = nil
    isParkingEventInFlight = false
    print("[ParkingMagic] Location Error: \(error.localizedDescription)")
  }

  fileprivate func handleAuthorizationChange(_ manager: CLLocationManager) {
    let status = manager.authorizationStatus
    if isSensing && canUseAlwaysBackgroundLocation(status) {
      startLocationMonitoringIfAuthorized()
    }

    guard let promise = permissionPromise else { return }
    switch status {
    case .authorizedAlways:
      promise.resolve(true)
      permissionPromise = nil
    case .denied, .restricted, .authorizedWhenInUse:
      promise.resolve(false)
      permissionPromise = nil
    default:
      break
    }
  }

  // MARK: - Audio Listeners
  private func handleRouteChange(notification: Notification) {
    guard let userInfo = notification.userInfo,
          let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
          let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else { return }
    
    switch reason {
    case .oldDeviceUnavailable:
      let previousRoute = userInfo[AVAudioSessionRouteChangePreviousRouteKey] as? AVAudioSessionRouteDescription
      let hasCarPlay = previousRoute?.outputs.contains(where: { $0.portType == .carAudio }) ?? false
      let source = hasCarPlay ? "carplay_disconnect" : "bluetooth_disconnect"
      print("[ParkingMagic] Bluetooth/CarPlay Disconnected - Detecting Arrival")
      emitParkingEvent(source: source)
    case .newDeviceAvailable:
      print("[ParkingMagic] Bluetooth/CarPlay Connected - Detecting Departure")
      endAutoSession(reason: "audio_reconnect")
    default:
      break
    }
  }
}

// MARK: - Notification Extensions
extension ParkingMagicModule {
  fileprivate func handleVulture(notification: Notification) {
    if let lotId = notification.userInfo?["lotId"] as? String {
      NetworkManager.shared.reportVultureActivity(lotId: lotId)
    }
  }
}

private final class LocationDelegateProxy: NSObject, CLLocationManagerDelegate {
  weak var owner: ParkingMagicModule?

  init(owner: ParkingMagicModule) {
    self.owner = owner
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    owner?.handleLocationUpdate(locations)
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    owner?.handleLocationFailure(error)
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    owner?.handleAuthorizationChange(manager)
  }
}

