import Combine
import CoreLocation
import Foundation

struct CampusRegionDefinition: Identifiable {
    let id: String
    let center: CLLocationCoordinate2D
    let radius: CLLocationDistance

    func contains(_ coordinate: CLLocationCoordinate2D) -> Bool {
        center.distance(to: coordinate) <= radius
    }
}

/// Thin wrapper over `CLLocationManager` that separates low-power sensing from
/// temporary high-accuracy bursts used during parking decisions.
@MainActor
final class LocationEngine: NSObject, ObservableObject {
    static let shared = LocationEngine()

    private let manager = CLLocationManager()
    private var transientStopTask: Task<Void, Never>?
    private var monitoredRegionIDs: Set<String> = []

    @Published private(set) var latestLocation: CLLocation?
    @Published private(set) var latestLocationAt: Date?
    @Published private(set) var latestHeading: CLLocationDirection?
    @Published private(set) var authorization: CLAuthorizationStatus = .notDetermined
    @Published private(set) var accuracyAuthorization: CLAccuracyAuthorization = .reducedAccuracy
    @Published private(set) var isForegroundUpdating = false
    @Published private(set) var isPassiveMonitoring = false
    @Published private(set) var isTransientUpdating = false
    @Published private(set) var monitoredCampusRegions: [String] = []

    var onLocationUpdate: ((CLLocation) -> Void)?
    var onVisit: ((CLVisit) -> Void)?
    var onRegionEvent: ((String, String, CLLocation?) -> Void)?

    private let campusRegions: [CampusRegionDefinition] = [
        CampusRegionDefinition(
            id: "busch",
            center: CLLocationCoordinate2D(latitude: 40.5230, longitude: -74.4580),
            radius: 2400
        ),
        CampusRegionDefinition(
            id: "college_ave",
            center: CLLocationCoordinate2D(latitude: 40.5008, longitude: -74.4474),
            radius: 2100
        ),
        CampusRegionDefinition(
            id: "livingston",
            center: CLLocationCoordinate2D(latitude: 40.5248, longitude: -74.4372),
            radius: 2200
        ),
        CampusRegionDefinition(
            id: "cook_douglass",
            center: CLLocationCoordinate2D(latitude: 40.4826, longitude: -74.4338),
            radius: 2600
        )
    ]

    override private init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.activityType = .automotiveNavigation
        manager.pausesLocationUpdatesAutomatically = true
        manager.headingFilter = 5
        authorization = manager.authorizationStatus
        accuracyAuthorization = manager.accuracyAuthorization
    }

    // MARK: - Permissions

    var hasForegroundPermission: Bool {
        authorization == .authorizedAlways || authorization == .authorizedWhenInUse
    }

    var hasBackgroundPermission: Bool {
        authorization == .authorizedAlways
    }

    func requestForegroundPermission() {
        switch authorization {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse:
            start()
            requestCurrentLocation()
        default:
            Logger.log("LocationEngine: foreground permission denied/restricted")
        }
    }

    func requestAlwaysPermission() {
        manager.requestAlwaysAuthorization()
    }

    // MARK: - Foreground/UI lifecycle

    func start() {
        guard hasForegroundPermission else {
            Logger.log("LocationEngine: cannot start foreground updates — permission=\(authorization.rawValue)")
            return
        }
        isForegroundUpdating = true
        reconcileMonitoringState()
    }

    func stop() {
        isForegroundUpdating = false
        latestHeading = nil
        reconcileMonitoringState()
    }

    // MARK: - Passive sensing lifecycle

    func startPassiveMonitoring() {
        guard hasBackgroundPermission else {
            Logger.log("LocationEngine: cannot start passive monitoring without Always")
            return
        }
        isPassiveMonitoring = true
        reconcileMonitoringState()
    }

    func stopPassiveMonitoring() {
        isPassiveMonitoring = false
        reconcileMonitoringState()
    }

    func startTransientHighAccuracy(reason: String, duration: TimeInterval = 35) {
        guard hasForegroundPermission else { return }
        isTransientUpdating = true
        Logger.log("LocationEngine: transient high-accuracy start reason=\(reason)")
        reconcileMonitoringState()
        transientStopTask?.cancel()
        transientStopTask = Task { @MainActor [weak self] in
            let ns = UInt64(max(1, duration) * 1_000_000_000)
            try? await Task.sleep(nanoseconds: ns)
            self?.stopTransientHighAccuracy(reason: "\(reason)_timeout")
        }
    }

    func stopTransientHighAccuracy(reason: String) {
        transientStopTask?.cancel()
        transientStopTask = nil
        guard isTransientUpdating else { return }
        isTransientUpdating = false
        Logger.log("LocationEngine: transient high-accuracy stop reason=\(reason)")
        reconcileMonitoringState()
    }

    func requestCurrentLocation() {
        manager.requestLocation()
    }

    func monitoredCampusCount() -> Int {
        monitoredRegionIDs.count
    }

    func campusLabel(for coordinate: CLLocationCoordinate2D) -> String? {
        campusRegions.first(where: { $0.contains(coordinate) })?.id
    }

    func isNearCampus(_ coordinate: CLLocationCoordinate2D) -> Bool {
        campusRegions.contains(where: { $0.contains(coordinate) })
    }

    private func reconcileMonitoringState() {
        let shouldRunStandardUpdates = isForegroundUpdating || isTransientUpdating

        manager.allowsBackgroundLocationUpdates = hasBackgroundPermission && (isPassiveMonitoring || isTransientUpdating)
        manager.pausesLocationUpdatesAutomatically = !isTransientUpdating

        if shouldRunStandardUpdates {
            manager.desiredAccuracy = isTransientUpdating ? kCLLocationAccuracyBest : kCLLocationAccuracyNearestTenMeters
            manager.startUpdatingLocation()
            manager.startUpdatingHeading()
        } else {
            manager.stopUpdatingLocation()
            manager.stopUpdatingHeading()
        }

        if isPassiveMonitoring && hasBackgroundPermission {
            manager.startMonitoringSignificantLocationChanges()
            manager.startMonitoringVisits()
            syncCampusRegions(enabled: true)
        } else {
            manager.stopMonitoringSignificantLocationChanges()
            manager.stopMonitoringVisits()
            syncCampusRegions(enabled: false)
        }
    }

    private func syncCampusRegions(enabled: Bool) {
        if enabled {
            for region in campusRegions where !monitoredRegionIDs.contains(region.id) {
                let monitored = CLCircularRegion(center: region.center, radius: region.radius, identifier: region.id)
                monitored.notifyOnEntry = true
                monitored.notifyOnExit = true
                manager.startMonitoring(for: monitored)
                monitoredRegionIDs.insert(region.id)
            }
        } else {
            for region in manager.monitoredRegions where monitoredRegionIDs.contains(region.identifier) {
                manager.stopMonitoring(for: region)
            }
            monitoredRegionIDs.removeAll()
        }
        monitoredCampusRegions = monitoredRegionIDs.sorted()
    }
}

// MARK: - Delegate

extension LocationEngine: CLLocationManagerDelegate {
    nonisolated func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            authorization = status
            accuracyAuthorization = manager.accuracyAuthorization
            reconcileMonitoringState()
            if hasForegroundPermission {
                requestCurrentLocation()
            }
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            authorization = manager.authorizationStatus
            accuracyAuthorization = manager.accuracyAuthorization
            reconcileMonitoringState()
            if hasForegroundPermission {
                requestCurrentLocation()
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let last = locations.last else { return }
        Task { @MainActor [weak self] in
            guard let self else { return }
            latestLocation = last
            latestLocationAt = Date()
            onLocationUpdate?(last)
            NativeSessionStore.shared.updateLiveActivityDistance(currentLocation: last)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didVisit visit: CLVisit) {
        Task { @MainActor [weak self] in
            self?.onVisit?(visit)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        guard let coordinate = latestLocation else {
            Task { @MainActor [weak self] in
                self?.onRegionEvent?("enter", region.identifier, nil)
            }
            return
        }
        Task { @MainActor [weak self] in
            self?.onRegionEvent?("enter", region.identifier, coordinate)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        guard let coordinate = latestLocation else {
            Task { @MainActor [weak self] in
                self?.onRegionEvent?("exit", region.identifier, nil)
            }
            return
        }
        Task { @MainActor [weak self] in
            self?.onRegionEvent?("exit", region.identifier, coordinate)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            Logger.log("LocationEngine: didFailWithError \(error.localizedDescription)")
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        Task { @MainActor [weak self] in
            let trueHeading = newHeading.trueHeading
            let magnetic = newHeading.magneticHeading
            let value = trueHeading >= 0 ? trueHeading : magnetic
            self?.latestHeading = value >= 0 ? value : nil
        }
    }
}
