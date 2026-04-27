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
    private(set) var lastDrivingStartAt: Date?
    private(set) var lastDrivingStopAt: Date?

    @Published private(set) var isDriving = false
    var onParkingTransition: (() -> Void)?
    var onDrivingResumed: (() -> Void)?

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
                self.lastMotionConfidence = activity.confidence
                if !wasDriving && nowDriving {
                    self.lastDrivingStartAt = Date()
                    self.onDrivingResumed?()
                }
                if wasDriving && !nowDriving {
                    let last = self.lastTransitionAt ?? .distantPast
                    if Date().timeIntervalSince(last) >= self.minInterval {
                        self.lastTransitionAt = Date()
                        self.lastDrivingStopAt = self.lastTransitionAt
                        self.onParkingTransition?()
                    }
                }
            }
        }
    }

    func stop() {
        manager.stopActivityUpdates()
    }

    @Published private(set) var lastMotionConfidence: CMMotionActivityConfidence = .low
}
