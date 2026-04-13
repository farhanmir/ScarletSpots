import ExpoModulesCore
import CoreLocation
import CoreMotion
import AVFoundation

public class ParkingMagicModule: Module, CLLocationManagerDelegate {
  private let locationManager = CLLocationManager()
  private let motionManager = CMMotionActivityManager()
  private var isSensing = false
  private var userPermit: String?
  
  public func definition() -> ModuleDefinition {
    Name("ParkingMagic")

    Events("onParkingEvent")

    OnCreate {
      locationManager.delegate = self
      locationManager.allowsBackgroundLocationUpdates = true
      locationManager.pausesLocationUpdatesAutomatically = false
    }

    Function("syncUserData") { (url: String, token: String, permit: String) in
      self.userPermit = permit
      NetworkManager.shared.configure(url: url, token: token)
      print("[ParkingMagic] Synced user data. Permit: \(permit)")
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
        selector: #selector(handleAudioRouteChange),
        name: AVAudioSession.routeChangeNotification,
        object: nil
      )
      
      // 3. Monitor Motion (Automotive -> Walking)
      startMotionUpdates()
    }

    Function("stopSensing") {
      isSensing = false
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

    View(ScarletMapView.self) {
      Prop("selectedLotId") { (view: ScarletMapView, prop: String?) in
        view.setSelectedLot(prop)
      }
      Events("onLotPress")
    }
  }

  // MARK: - Bluetooth / CarPlay Sensing
  @objc private func handleAudioRouteChange(notification: Notification) {
    guard let userInfo = notification.userInfo,
          let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
          let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else { return }
    
    // We only care about devices becoming unavailable (disconnect)
    if reason == .oldDeviceUnavailable {
      if let previousRoute = userInfo[AVAudioSessionRouteChangePreviousRouteKey] as? AVAudioSessionRouteDescription {
        let hasCarAudio = previousRoute.outputs.contains { 
          $0.portType == .carPlay || $0.portType == .bluetoothA2DP || $0.portType == .bluetoothHFP 
        }
        
        if hasCarAudio {
          emitParkingEvent(source: "bluetooth_disconnect")
        }
      }
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
      } else if (activity.walking || activity.stationary) && lastWasAutomotive {
        // Detected transition from driving to walking/standing
        lastWasAutomotive = false
        self.emitParkingEvent(source: "motion_activity")
      }
    }
  }

  // MARK: - Event Emission
  private func emitParkingEvent(source: String) {
    locationManager.requestLocation()
    
    guard let location = locationManager.location else { return }
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
    ) { success in
      if !success {
        // Fallback to Offline Queue
        let event = PendingEvent(
          latitude: coordinate.latitude,
          longitude: coordinate.longitude,
          source: source,
          timestamp: Date().timeIntervalSince1970,
          lotId: lotId
        )
        OfflineQueueManager.shared.enqueue(event: event)
        print("[ParkingMagic] Event queued for offline sync.")
      }
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
    
    // Phase 9: Real-time Navigation Logic (Finding Car)
    // In a real app, we'd check if a car pin is active
    // For this implementation, we'll simulate the "Hot/Cold" guidance
    if let carLocation = UserDefaults.standard.object(forKey: "car_pin_location") as? [String: Double] {
      let carCoord = CLLocation(latitude: carLocation["lat"] ?? 0, longitude: carLocation["lng"] ?? 0)
      let distance = location.distance(from: carCoord)
      
      // Drive Haptics
      if distance < 50 {
        HapticManager.shared.playGuidancePulse(distance: distance)
      }
      
      // Update Live Activity
      LiveActivityManager.shared.updateActivity(distance: "\(Int(distance))m")
    }
  }

  public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    print("[ParkingMagic] Location Error: \(error.localizedDescription)")
  }

  // MARK: - Audio Listeners
  @objc private func handleRouteChange(notification: Notification) {
    guard let userInfo = notification.userInfo,
          let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
          let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else { return }
    
    switch reason {
    case .oldDeviceUnavailable:
      print("[ParkingMagic] Bluetooth/CarPlay Disconnected - Detecting Arrival")
      emitParkingEvent(source: "bluetooth_disconnect")
    case .newDeviceAvailable:
      print("[ParkingMagic] Bluetooth/CarPlay Connected - Detecting Departure")
      // Phase 9: Native Departure Trigger
      NetworkManager.shared.endParkingSession { success in
        if success {
          LiveActivityManager.shared.stopActivity()
        }
      }
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
