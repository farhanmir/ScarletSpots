import CoreHaptics
import Foundation

class HapticManager {
  static let shared = HapticManager()
  private var engine: CHHapticEngine?

  init() {
    guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return }
    do {
      engine = try CHHapticEngine()
      try engine?.start()
    } catch {
      print("Haptic Engine Error: \(error.localizedDescription)")
    }
  }

  func playGuidancePulse(distance: Double) {
    let intensity: Float
    let sharpness: Float
    
    // Scale intensity: 1.0 at 0m, 0.4 at 50m
    intensity = Float(max(0.4, min(1.0, 1.0 - (distance / 100.0))))
    sharpness = Float(max(0.2, min(0.8, 1.0 - (distance / 80.0))))
    
    playPulse(intensity: intensity, sharpness: sharpness)
  }

  private func playPulse(intensity: Float, sharpness: Float) {
    guard let engine = engine else { return }
    
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
      print("Failed to play haptic pulse: \(error.localizedDescription)")
    }
  }
}
