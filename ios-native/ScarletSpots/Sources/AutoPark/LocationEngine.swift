import Combine
import CoreLocation
import Foundation

/// Thin wrapper over `CLLocationManager` that drives the auto-park pipeline.
///
/// The single `CLLocationManager` here is the only one in the app — both map
/// UI and auto-park detection observe `latestLocation`.
@MainActor
final class LocationEngine: NSObject, ObservableObject {
    static let shared = LocationEngine()

    private let manager = CLLocationManager()

    @Published private(set) var latestLocation: CLLocation?
    @Published private(set) var latestLocationAt: Date?
    @Published private(set) var authorization: CLAuthorizationStatus = .notDetermined
    @Published private(set) var accuracyAuthorization: CLAccuracyAuthorization = .reducedAccuracy

    /// Downstream observer for raw CoreLocation updates (used by AutoPark to
    /// evaluate location-driven triggers without polling).
    var onLocationUpdate: ((CLLocation) -> Void)?

    private var didStart = false

    override private init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.activityType = .automotiveNavigation
        manager.pausesLocationUpdatesAutomatically = false
        self.authorization = manager.authorizationStatus
        self.accuracyAuthorization = manager.accuracyAuthorization
    }

    // MARK: - Permissions

    var hasForegroundPermission: Bool {
        authorization == .authorizedAlways || authorization == .authorizedWhenInUse
    }

    var hasBackgroundPermission: Bool {
        authorization == .authorizedAlways
    }

    func requestForegroundPermission() {
        guard authorization == .notDetermined else { return }
        manager.requestWhenInUseAuthorization()
    }

    func requestAlwaysPermission() {
        manager.requestAlwaysAuthorization()
    }

    // MARK: - Lifecycle

    /// Begin location updates. Safe to call repeatedly; only the first call
    /// actually starts the hardware.
    func start() {
        guard !didStart else { return }
        guard hasForegroundPermission else {
            Logger.log("LocationEngine: cannot start — permission=\(authorization.rawValue)")
            return
        }
        didStart = true

        // Only enable background updates after confirming `authorizedAlways`.
        // Turning on `allowsBackgroundLocationUpdates` while holding
        // whenInUse triggers a runtime crash on real devices.
        manager.allowsBackgroundLocationUpdates = hasBackgroundPermission
        manager.startUpdatingLocation()
        manager.startMonitoringSignificantLocationChanges()
    }

    func stop() {
        didStart = false
        manager.stopUpdatingLocation()
        manager.stopMonitoringSignificantLocationChanges()
        manager.allowsBackgroundLocationUpdates = false
    }

    func requestCurrentLocation() {
        manager.requestLocation()
    }
}

// MARK: - Delegate

extension LocationEngine: CLLocationManagerDelegate {
    nonisolated func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.authorization = status
            self.accuracyAuthorization = manager.accuracyAuthorization
            if self.didStart {
                manager.allowsBackgroundLocationUpdates = (status == .authorizedAlways)
            }
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.authorization = manager.authorizationStatus
            self.accuracyAuthorization = manager.accuracyAuthorization
            if self.didStart {
                manager.allowsBackgroundLocationUpdates = (manager.authorizationStatus == .authorizedAlways)
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let last = locations.last else { return }
        Task { @MainActor [weak self] in
            self?.latestLocation = last
            self?.latestLocationAt = Date()
            self?.onLocationUpdate?(last)
            NativeSessionStore.shared.updateLiveActivityDistance(currentLocation: last)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            Logger.log("LocationEngine: didFailWithError \(error.localizedDescription)")
        }
    }
}
