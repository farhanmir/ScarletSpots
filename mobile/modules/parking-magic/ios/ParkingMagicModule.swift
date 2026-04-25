import ExpoModulesCore
import CoreLocation
import CoreMotion
import AVFoundation
import ActivityKit

public class ParkingMagicModule: Module, CLLocationManagerDelegate {
  private let locationManager = CLLocationManager()
  private let motionManager = CMMotionActivityManager()
  private let userDefaults = UserDefaults.standard
  private let activeAutoSessionKey = "com.scarletspots.parkingmagic.activeAutoSession"
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
  
  public func definition() -> ModuleDefinition {
    Name("ParkingMagic")

    Events("onParkingEvent")

    OnCreate {
      locationManager.delegate = self
      locationManager.allowsBackgroundLocationUpdates = true
      locationManager.pausesLocationUpdatesAutomatically = false
      hasActiveAutoSession = userDefaults.bool(forKey: activeAutoSessionKey)
    }

    Function("syncUserData") { (url: String, token: String, permit: String) in
      self.userPermit = permit
      NetworkManager.shared.configure(url: url, token: token)
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
      NetworkManager.shared.reset()
      VultureManager.shared.reset()
      OfflineQueueManager.shared.clear()
      self.setActiveAutoSession(false)
      self.parkedLocation = nil
      self.drivingAwayStartAt = nil
      print("[ParkingMagic] User data and state purged.")
    }

    AsyncFunction("requestPermissionsAsync") { (promise: Promise) in
      locationManager.requestAlwaysAuthorization()
      // Note: Motion/Health permissions might need separate requests
      promise.resolve(true)
    }

    Function("startSensing") {
      guard !isSensing else { return }
      isSensing = true
      
      // 1. Monitor Significant Locations (App Anchor)
      locationManager.startMonitoringSignificantLocationChanges()
      
      // 2. Monitor Audio Route (BT/CarPlay)
      NotificationCenter.default.addObserver(
        self,
        selector: #selector(handleRouteChange),
        name: AVAudioSession.routeChangeNotification,
        object: nil
      )
      NotificationCenter.default.addObserver(
        self,
        selector: #selector(handleVulture(notification:)),
        name: .vultureDetected,
        object: nil
      )
      
      // 3. Monitor Motion (Automotive -> Walking)
      startMotionUpdates()
    }

    Function("stopSensing") {
      isSensing = false
      pendingEventSource = nil
      isParkingEventInFlight = false
      isEndingSession = false
      lastParkingEventAt = nil
      locationManager.stopMonitoringSignificantLocationChanges()
      NotificationCenter.default.removeObserver(self)
      motionManager.stopActivityUpdates()
    }

    AsyncFunction("getSystemHealthAsync") { (promise: Promise) in
      let backgroundLocationOk = CLLocationManager.authorizationStatus() == .authorizedAlways
      let motionOk = CMMotionActivityManager.isActivityAvailable()
      
      let audioSession = AVAudioSession.sharedInstance()
      let bluetoothOk = audioSession.currentRoute.outputs.contains { $0.portType == .bluetoothA2DP || $0.portType == .bluetoothLE || $0.portType == .bluetoothHFP }
      
      let ok = backgroundLocationOk && motionOk
      
      var reasons: [String] = []
      if !backgroundLocationOk { reasons.append("location_background_missing") }
      if !motionOk { reasons.append("motion_activity_unavailable") }
      
      let status: [String: Any] = [
        "ok": ok,
        "reasons": reasons,
        "backgroundLocationOk": backgroundLocationOk,
        "motionOk": motionOk,
        "bluetoothOk": bluetoothOk
      ]
      promise.resolve(status)
    }

    AsyncFunction("getNativeSessionStateAsync") { (promise: Promise) in
      promise.resolve([
        "activeAutoSession": self.hasActiveAutoSession,
        "isParkingEventInFlight": self.isParkingEventInFlight,
        "isEndingSession": self.isEndingSession,
        "pendingEventSource": self.pendingEventSource as Any,
      ])
    }

    AsyncFunction("runAutoParkSmokeTestAsync") { (latitude: Double, longitude: Double, promise: Promise) in
      let location = CLLocation(latitude: latitude, longitude: longitude)
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
            if #available(iOS 16.1, *) {
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
            "error": endSuccess ? NSNull() : "end_failed"
          ])
        }
      }
    }

    AsyncFunction("resolveLotAtAsync") { (latitude: Double, longitude: Double, promise: Promise) in
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
      return
    }

    let now = Date()
    if isParkingEventInFlight {
      return
    }
    if let lastParkingEventAt, now.timeIntervalSince(lastParkingEventAt) < parkingEventCooldown {
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

  private func reconcileActiveSessionFromServer() {
    NetworkManager.shared.fetchActiveParkingSession { status in
      guard let status = status else { return }

      self.setActiveAutoSession(status.isActive)
      if status.isActive,
         let latitude = status.latitude,
         let longitude = status.longitude {
        self.parkedLocation = CLLocation(latitude: latitude, longitude: longitude)
      }
      if !status.isActive {
        self.parkedLocation = nil
        self.drivingAwayStartAt = nil
      }
    }
  }

  private func passesAutoStartConfidence(source: String, location: CLLocation) -> Bool {
    let accuracy = location.horizontalAccuracy
    if accuracy < 0 || accuracy > minArrivalAccuracyMeters {
      return false
    }

    let speed = location.speed
    if speed >= 0 && speed > maxArrivalSpeedMps {
      return false
    }

    if source == "motion_activity" {
      guard let lastTransition = lastAutomotiveTransitionAt,
            Date().timeIntervalSince(lastTransition) <= motionTransitionWindow,
            lastMotionConfidence != .low else {
        return false
      }
    }

    return true
  }

  private func endAutoSession(reason: String) {
    guard !isEndingSession else { return }
    isEndingSession = true
    print("[ParkingMagic] Ending auto-session via \(reason)")
    NetworkManager.shared.endParkingSession { success in
      self.isEndingSession = false
      if success {
        self.lastParkingEventAt = nil
        self.setActiveAutoSession(false)
        self.parkedLocation = nil
        self.drivingAwayStartAt = nil
        if #available(iOS 16.1, *) {
          LiveActivityManager.shared.stopActivity()
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
    if !passesAutoStartConfidence(source: source, location: location) {
      print("[ParkingMagic] Dropped low-confidence sensing event: \(source)")
      isParkingEventInFlight = false
      completion?(false)
      return
    }

    let coordinate = location.coordinate
    
    // Phase 7: Resolve lotId natively
    let lot = DatabaseManager.shared.getLotAt(coordinate: coordinate)
    let lotId = lot?.id ?? "unknown"
    let lotName = lot?.name ?? "Unknown Lot"

    // Phase 4: Ticket Shield Validation
    let validation = TicketShield.shared.validateParking(permitType: self.userPermit ?? "Public", lotId: lotId)
    
    print("[ParkingMagic] Sensing Event: \(source) at \(lotName). Validation: \(validation.message)")

    // Phase 8: Hard-Wired Direct Sync
    NetworkManager.shared.submitParkingEvent(
      lotId: lotId,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      source: source
    ) { success, eventId in
      self.isParkingEventInFlight = false
      self.lastParkingEventAt = Date()

      if success {
        self.setActiveAutoSession(true)
        self.parkedLocation = location
        self.drivingAwayStartAt = nil
      }

      if !success {
        let event = PendingEvent(
          id: eventId ?? UUID().uuidString,
          latitude: coordinate.latitude,
          longitude: coordinate.longitude,
          source: source,
          timestamp: Date().timeIntervalSince1970,
          lotId: lotId
        )
        OfflineQueueManager.shared.enqueue(event: event)
        print("[ParkingMagic] Event queued for offline sync.")
      }

      completion?(success)
    }

    if #available(iOS 16.1, *) {
      LiveActivityManager.shared.startParkingActivity(lotName: lotName)
    }

    // Bridge Notification (for open app)
    self.sendEvent("onParkingEvent", [
      "latitude": coordinate.latitude,
      "longitude": coordinate.longitude,
      "source": source,
      "lotId": lotId,
      "message": validation.message,
      "timestamp": Date().timeIntervalSince1970 * 1000
    ])
  }

  public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
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
      
      LiveActivityManager.shared.updateActivity(distance: "\(Int(distance))m")
    }

    evaluateFallbackDeparture(location: location)
  }

  public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    pendingEventSource = nil
    isParkingEventInFlight = false
    print("[ParkingMagic] Location Error: \(error.localizedDescription)")
  }

  // MARK: - Audio Listeners
  @objc private func handleRouteChange(notification: Notification) {
    guard let userInfo = notification.userInfo,
          let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
          let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else { return }
    
    switch reason {
    case .oldDeviceUnavailable:
      let previousRoute = userInfo[AVAudioSessionRouteChangePreviousRouteKey] as? AVAudioSessionRouteDescription
      let hasCarPlay = previousRoute?.outputs.contains(where: { $0.portType == .carPlay }) ?? false
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
  @objc private func handleVulture(notification: Notification) {
    if let lotId = notification.userInfo?["lotId"] as? String {
      NetworkManager.shared.reportVultureActivity(lotId: lotId)
    }
  }
}
