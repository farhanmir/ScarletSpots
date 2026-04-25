import SwiftUI

/// Pulsing pin shown on the map for auto-park candidates awaiting user
/// confirmation.
///
/// The outer ring expands/fades continuously to draw attention to the tap
/// target — this is the only way a user can trigger the confirmation sheet
/// from the map itself.
struct CandidatePin: View {
    let candidate: ParkingCandidate

    @State private var pulse = false

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.red.opacity(0.6), lineWidth: 2)
                .frame(width: 54, height: 54)
                .scaleEffect(pulse ? 1.35 : 0.85)
                .opacity(pulse ? 0 : 0.9)
                .animation(.easeOut(duration: 1.6).repeatForever(autoreverses: false), value: pulse)

            Circle()
                .fill(Color.red.opacity(0.18))
                .frame(width: 32, height: 32)

            Image(systemName: "parkingsign.circle.fill")
                .font(.title2)
                .foregroundStyle(.white, .red)
                .shadow(color: .black.opacity(0.3), radius: 3, y: 1)
        }
        .accessibilityLabel("Parking candidate in \(candidate.lotId)")
        .onAppear { pulse = true }
    }
}
