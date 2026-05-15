import Foundation
import Combine
import CoreLocation

@MainActor
final class NativeSessionStore: ObservableObject {
    enum TruthSource: String, Codable {
        case server
        case cache
        case none
        case pendingQueue
    }

    static let shared = NativeSessionStore()
    @Published var activeSession: ParkingSession?
    @Published private(set) var truthSource: TruthSource = .none
    @Published private(set) var lastSyncAt: Date?
    @Published private(set) var lastError: String?
    private init() {}

    func refresh() async {
        do {
            activeSession = try await ParkAPI.activeSession()
            OfflineCache.shared.cacheSession(activeSession)
            truthSource = activeSession == nil ? .none : .server
            lastError = nil
            lastSyncAt = Date()
            syncLiveActivity()
        } catch {
            activeSession = OfflineCache.shared.getCachedSession()
            truthSource = activeSession == nil ? .none : .cache
            lastError = error.localizedDescription
            lastSyncAt = Date()
            syncLiveActivity()
        }
    }

    func bootstrapRefresh() async {
        await refresh()
        let pendingTypes = Set(OfflineQueue.shared.pendingTypes)
        if pendingTypes.contains("PARK") || pendingTypes.contains("END_SESSION") {
            truthSource = .pendingQueue
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
        let deckSubtitle: String? = {
            guard let raw = activeSession.deckLevelLabel?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !raw.isEmpty else { return nil }
            return "Level \(raw)"
        }()
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
            distance: distance,
            deckLevelSubtitle: deckSubtitle
        )
    }

    private static func formatDistance(meters: Double) -> String {
        let feet = meters * 3.28084
        if feet < 528 { return "\(Int(feet)) ft" }
        let miles = feet / 5280
        return String(format: "%.1f mi", miles)
    }
}
