import CoreMotion
import Foundation

/// Observes `CMMotionActivityManager` and reports transitions from driving
/// → non-driving. Emits at most one transition per `minInterval` to absorb
/// the flapping that the activity classifier sometimes produces while
/// parking.
@MainActor
final class MotionEngine: ObservableObject {
    static let shared = MotionEngine()

    private let manager = CMMotionActivityManager()
    private var lastTransitionAt: Date?
    private let minInterval: TimeInterval = 8

    @Published private(set) var isDriving = false
    var onParkingTransition: (() -> Void)?

    private init() {}

    var isAvailable: Bool { CMMotionActivityManager.isActivityAvailable() }

    var authorizationStatus: CMAuthorizationStatus {
        CMMotionActivityManager.authorizationStatus()
    }

    func start() {
        guard isAvailable else { return }
        manager.startActivityUpdates(to: .main) { [weak self] activity in
            Task { @MainActor [weak self] in
                guard let self, let activity else { return }
                let wasDriving = self.isDriving
                let nowDriving = activity.automotive && (activity.confidence != .low)
                self.isDriving = nowDriving
                if wasDriving && !nowDriving {
                    let last = self.lastTransitionAt ?? .distantPast
                    if Date().timeIntervalSince(last) >= self.minInterval {
                        self.lastTransitionAt = Date()
                        self.onParkingTransition?()
                    }
                }
            }
        }
    }

    func stop() {
        manager.stopActivityUpdates()
    }
}
