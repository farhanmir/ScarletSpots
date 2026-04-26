import AVFoundation
import Foundation

/// Listens for Bluetooth/headphone disconnects on the audio session.
///
/// A car's Bluetooth disconnecting is an extremely strong signal that the
/// user just stepped out, so we treat it as a likely arrival and notify
/// downstream (the AutoParkCoordinator decides whether to commit).
@MainActor
final class AudioRouteEngine {
    static let shared = AudioRouteEngine()

    var onLikelyArrival: (() -> Void)?
    var onLikelyDeparture: (() -> Void)?
    private(set) var lastDisconnectAt: Date?
    private(set) var lastReconnectAt: Date?
    private(set) var lastRouteChangeReason: AVAudioSession.RouteChangeReason?
    private var observer: NSObjectProtocol?

    private init() {}

    func start() {
        stop() // avoid duplicate observers
        // Activating the audio session here so we actually receive route
        // notifications even when the app isn't playing audio.
        try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [])

        observer = NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self,
                  let reasonValue = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
                  let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue)
            else { return }
            self.lastRouteChangeReason = reason
            if reason == .oldDeviceUnavailable {
                self.lastDisconnectAt = Date()
                self.onLikelyArrival?()
            } else if reason == .newDeviceAvailable {
                self.lastReconnectAt = Date()
                self.onLikelyDeparture?()
            }
        }
    }

    func stop() {
        if let observer {
            NotificationCenter.default.removeObserver(observer)
        }
        observer = nil
    }
}
