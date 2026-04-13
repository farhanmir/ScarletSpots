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

  func playHotPulse() {
    playPulse(intensity: 1.0, sharpness: 0.8)
  }

  func playColdPulse() {
    playPulse(intensity: 0.4, sharpness: 0.2)
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
