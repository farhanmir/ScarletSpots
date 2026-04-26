import SwiftUI

/// Floating chip shown on the Map while a parking session is active.
///
/// Shows the resolved lot name (falling back to the raw `lotId`) and the
/// elapsed duration since the session started. Tapping "End" sends the end
/// request, falling back to the offline queue if needed.
struct ActiveSessionChip: View {
    let session: ParkingSession
    @StateObject private var lotRepository = LotRepository.shared
    @State private var ending = false
    @State private var showEndConfirm = false

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Image(systemName: "parkingsign.circle.fill")
                        .foregroundStyle(.red)
                    Text(lotTitle)
                        .font(.headline)
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                }
                Text(timerInterval: session.startTime...Date.now, pauseTime: nil, countsDown: false, showsHours: true)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 12)
            Button {
                guard !ending else { return }
                showEndConfirm = true
            } label: {
                Text(ending ? "Ending…" : "End")
                    .font(.subheadline.bold())
                    .frame(minWidth: 54)
            }
            .buttonStyle(.borderedProminent)
            .tint(.red)
            .controlSize(.small)
            .disabled(ending)
            .accessibilityLabel(ending ? "Ending session" : "End parking session")
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 14)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(
            Capsule().stroke(Color.red.opacity(0.25), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.18), radius: 6, y: 2)
        .padding(.horizontal, 16)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Active parking session at \(lotTitle)")
        .confirmationDialog(
            "End parking session?",
            isPresented: $showEndConfirm,
            titleVisibility: .visible
        ) {
            Button("End Session", role: .destructive) { endSession() }
            Button("Keep Parked", role: .cancel) {}
        } message: {
            Text("This marks you as no longer parked in \(lotTitle).")
        }
    }

    private func endSession() {
        guard !ending else { return }
        ending = true
        Task {
            let key = "end_\(session.id.uuidString)"
            do {
                try await ParkAPI.endSession(idempotencyKey: key)
                await NativeSessionStore.shared.refresh()
            } catch {
                await OfflineQueue.shared.enqueue(
                    type: "END_SESSION",
                    endpoint: "park/session/end",
                    payload: nil,
                    idempotencyKey: key
                )
            }
            ending = false
        }
    }

    private var lotTitle: String {
        if let lot = lotRepository.byId(session.lotId) { return lot.shortName }
        return "Parked in \(session.lotId)"
    }

}
