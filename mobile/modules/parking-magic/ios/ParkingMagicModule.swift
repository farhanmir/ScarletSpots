import ExpoModulesCore
import CoreLocation
import CoreMotion
import AVFoundation

public class ParkingMagicModule: Module, CLLocationManagerDelegate {
  private let locationManager = CLLocationManager()
  private let motionManager = CMMotionActivityManager()
  private var isSensing = false
  
  public func definition() -> ModuleDefinition {
    Name("ParkingMagic")

    Events("onParkingEvent")

    OnCreate {
      locationManager.delegate = self
      locationManager.allowsBackgroundLocationUpdates = true
      locationManager.pausesLocationUpdatesAutomatically = false
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
    // Snap high-precision location on trigger
    locationManager.requestLocation()
    
    // We'll also emit immediately with whatever we have (or just the source)
    if let location = locationManager.location {
      self.sendEvent("onParkingEvent", [
        "latitude": location.coordinate.latitude,
        "longitude": location.coordinate.longitude,
        "source": source,
        "timestamp": Date().timeIntervalSince1970 * 1000
      ])
      
      // Phase 4: Offline Queue backup
      let event = PendingEvent(
        latitude: location.coordinate.latitude,
        longitude: location.coordinate.longitude,
        source: source,
        timestamp: Date().timeIntervalSince1970,
        lotId: nil // TODO: Resolve lotId
      )
      OfflineQueueManager.shared.enqueue(event: event)
    }
  }

  public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let location = locations.last else { return }
    
    // Phase 7: Resolve lotId natively using the PIP engine
    let lot = DatabaseManager.shared.getLotAt(coordinate: location.coordinate)
    let lotId = lot?.id
    
    // Phase 4: Report to VultureManager with resolved lotId
    VultureManager.shared.reportLocation(location: location, lotId: lotId)
    
    // If we have a pending event, update its lotId
    // (OfflineQueueManager could be updated to handle this refinement)
  }

  public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    // Handle error
  }
}
