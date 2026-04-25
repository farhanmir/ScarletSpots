import Foundation
import Combine
import CoreLocation

@MainActor
final class NativeSessionStore: ObservableObject {
    static let shared = NativeSessionStore()
    @Published var activeSession: ParkingSession?
    private init() {}

    func refresh() async {
        do {
            activeSession = try await ParkAPI.activeSession()
            OfflineCache.shared.cacheSession(activeSession)
            syncLiveActivity()
        } catch {
            activeSession = OfflineCache.shared.getCachedSession()
            syncLiveActivity()
        }
    }

    func updateLiveActivityDistance(currentLocation: CLLocation) {
        guard let session = activeSession,
              let sessionLat = session.latitude,
              let sessionLng = session.longitude
        else { return }

        let parkedLocation = CLLocation(latitude: sessionLat, longitude: sessionLng)
        let distance = Self.formatDistance(meters: currentLocation.distance(from: parkedLocation))
        if #available(iOS 16.2, *) {
            LiveActivityManager.shared.updateActivity(distance: distance)
        }
    }

    private func syncLiveActivity() {
        guard #available(iOS 16.2, *) else { return }

        guard let activeSession else {
            LiveActivityManager.shared.stopActivity()
            return
        }

        let lotName = LotRepository.shared.byId(activeSession.lotId)?.shortName
            ?? "Lot \(activeSession.lotId)"
        let distance: String
        if let currentLocation = LocationEngine.shared.latestLocation,
           let sessionLat = activeSession.latitude,
           let sessionLng = activeSession.longitude {
            let parkedLocation = CLLocation(latitude: sessionLat, longitude: sessionLng)
            distance = Self.formatDistance(meters: currentLocation.distance(from: parkedLocation))
        } else {
            distance = "—"
        }
        LiveActivityManager.shared.startParkingActivity(
            lotId: activeSession.lotId,
            lotName: lotName,
            distance: distance
        )
    }

    private static func formatDistance(meters: Double) -> String {
        let feet = meters * 3.28084
        if feet < 528 { return "\(Int(feet)) ft" }
        let miles = feet / 5280
        return String(format: "%.1f mi", miles)
    }
}
