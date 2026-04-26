import CoreHaptics
import Foundation
import UIKit

final class HapticManager {
    static let shared = HapticManager()
    private var engine: CHHapticEngine?

    private init() {
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return }
        do {
            engine = try CHHapticEngine()
            try engine?.start()
        } catch {
            Logger.log("Haptic engine init failed: \(error.localizedDescription)")
        }
    }

    func selection() {
        Task { @MainActor in
            let generator = UISelectionFeedbackGenerator()
            generator.prepare()
            generator.selectionChanged()
        }
    }

    func success() {
        notification(.success)
    }

    func warning() {
        notification(.warning)
    }

    func error() {
        notification(.error)
    }

    func softImpact() {
        impact(.soft)
    }

    func mediumImpact() {
        impact(.medium)
    }

    func playGuidancePulse(distance: Double) {
        guard let engine else { return }
        let intensity = Float(max(0.4, min(1.0, 1.0 - (distance / 100.0))))
        let sharpness = Float(max(0.2, min(0.8, 1.0 - (distance / 80.0))))
        let event = CHHapticEvent(
            eventType: .hapticTransient,
            parameters: [
                CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
                CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness)
            ],
            relativeTime: 0
        )
        do {
            let pattern = try CHHapticPattern(events: [event], parameters: [])
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: 0)
        } catch {
            Logger.log("Haptic pulse failed: \(error.localizedDescription)")
        }
    }

    private func notification(_ type: UINotificationFeedbackGenerator.FeedbackType) {
        Task { @MainActor in
            let generator = UINotificationFeedbackGenerator()
            generator.prepare()
            generator.notificationOccurred(type)
        }
    }

    private func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        Task { @MainActor in
            let generator = UIImpactFeedbackGenerator(style: style)
            generator.prepare()
            generator.impactOccurred()
        }
    }
}
