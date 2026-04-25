import SwiftUI

/// Sheet presented when the auto-park pipeline detects a likely arrival but
/// the confidence isn't high enough to auto-commit.
///
/// The user picks which lot they're actually in from the candidate list, or
/// dismisses the sheet to cancel the suggestion. If they tap outside, we
/// treat it as "dismiss" — never silently commit.
struct ParkingConfirmationSheet: View {
    let candidates: [ParkingCandidate]
    let onConfirm: (ParkingCandidate) -> Void
    let onDismiss: () -> Void

    @StateObject private var lotRepository = LotRepository.shared

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    header

                    VStack(spacing: 10) {
                        ForEach(candidates) { candidate in
                            candidateCard(for: candidate)
                        }
                    }

                    if candidates.isEmpty {
                        Text("No candidates to confirm.")
                            .foregroundStyle(.secondary)
                    }

                    Button(role: .cancel) {
                        onDismiss()
                    } label: {
                        Text("Not parking")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .padding(.top, 4)
                }
                .padding(20)
            }
            .navigationTitle("Confirm Parking")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Did you just park?")
                .font(.title3.bold())
            Text("We detected you stopped in a lot. Pick the one you're in to start a session.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func candidateCard(for candidate: ParkingCandidate) -> some View {
        let lot = lotRepository.byId(candidate.lotId)
        Button {
            onConfirm(candidate)
        } label: {
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(Color.red.opacity(0.12))
                        .frame(width: 42, height: 42)
                    Image(systemName: "parkingsign.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.red)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(lot?.shortName ?? candidate.lotId)
                        .font(.headline)
                        .foregroundStyle(.primary)
                    Text(lot?.propertyName ?? candidate.source.replacingOccurrences(of: "_", with: " "))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    ProgressView(value: candidate.confidence)
                        .tint(candidate.confidence > 0.75 ? .green : .orange)
                        .frame(maxWidth: 140)
                }
                Spacer()
                VStack {
                    Text("\(Int(candidate.confidence * 100))%")
                        .font(.caption.monospacedDigit().bold())
                    Text("match")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(14)
            .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color.red.opacity(0.12), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}
