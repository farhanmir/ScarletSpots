import SwiftUI

/// Live explainability panel for Auto-Park trigger decisions.
struct AutoParkInsightsView: View {
    @StateObject private var autoPark = AutoParkCoordinator.shared

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                statusHeader
                telemetryCard
                checksCard
                historyCard
            }
            .padding(16)
        }
        .background(
            LinearGradient(
                colors: [
                    Color(red: 0.05, green: 0.06, blue: 0.08),
                    Color(red: 0.11, green: 0.12, blue: 0.16)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
        )
        .navigationTitle("Auto-Park Live Insights")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            autoPark.refreshLiveSnapshot()
        }
    }

    private var statusHeader: some View {
        let snapshot = autoPark.liveSnapshot
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center) {
                Image(systemName: "car.side.fill")
                    .font(.title2)
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(Color.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))

                VStack(alignment: .leading, spacing: 2) {
                    Text(snapshot.decision.replacingOccurrences(of: "_", with: " ").uppercased())
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(.white)
                    Text(snapshot.reason.replacingOccurrences(of: "_", with: " "))
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.75))
                }

                Spacer()

                if let confidence = snapshot.confidence {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(String(format: "%.2f", confidence))
                            .font(.title3.weight(.bold))
                            .foregroundStyle(.white)
                        Text(String(format: "threshold %.2f", snapshot.threshold))
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.75))
                    }
                }
            }

            Divider().overlay(Color.white.opacity(0.15))

            HStack(spacing: 8) {
                metricPill("Mode", snapshot.mode)
                metricPill("Source", snapshot.triggerSource ?? "none")
                if let lot = snapshot.lotId {
                    metricPill("Lot", lot)
                }
            }
        }
        .padding(16)
        .background(Color.black.opacity(0.28), in: RoundedRectangle(cornerRadius: 18))
    }

    private var telemetryCard: some View {
        let snapshot = autoPark.liveSnapshot
        return VStack(alignment: .leading, spacing: 10) {
            Text("Raw Sensors")
                .font(.headline)
                .foregroundStyle(.white)

            telemetryRow("Latitude", value: formatDouble(snapshot.latitude, digits: 6))
            telemetryRow("Longitude", value: formatDouble(snapshot.longitude, digits: 6))
            telemetryRow("Accuracy", value: formatDouble(snapshot.horizontalAccuracy, suffix: "m"))
            telemetryRow("Speed", value: formatSpeed(snapshot.speedMetersPerSecond))
            telemetryRow("Location age", value: formatDouble(snapshot.locationAgeSeconds, suffix: "s"))
            telemetryRow("Driving", value: snapshot.isDriving ? "true" : "false")
            telemetryRow("Cooldown", value: "\(Int(snapshot.cooldownRemainingSeconds.rounded()))s")
            telemetryRow("Auth", value: snapshot.locationAuthorizationLabel)
            telemetryRow("Always permission", value: snapshot.hasAlwaysLocationPermission ? "true" : "false")
            telemetryRow("Reduced accuracy", value: snapshot.reducedAccuracy ? "true" : "false")
            telemetryRow("Motion available", value: snapshot.motionAvailable ? "true" : "false")
            telemetryRow("Motion authorized", value: snapshot.motionAuthorized ? "true" : "false")
            telemetryRow("Audio disconnect age", value: formatDouble(snapshot.lastAudioDisconnectSecondsAgo, suffix: "s"))
            telemetryRow("Active session", value: snapshot.activeSessionPresent ? "true" : "false")
            telemetryRow("Offline queue", value: "\(snapshot.queueDepth)")
            telemetryRow("Updated", value: snapshot.timestamp.formatted(date: .omitted, time: .standard))
        }
        .padding(16)
        .background(Color.black.opacity(0.28), in: RoundedRectangle(cornerRadius: 18))
    }

    private var checksCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Gate Checks")
                .font(.headline)
                .foregroundStyle(.white)

            if autoPark.liveSnapshot.checks.isEmpty {
                Text("No gate data yet")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.7))
            } else {
                ForEach(autoPark.liveSnapshot.checks) { check in
                    HStack(alignment: .top, spacing: 10) {
                        Circle()
                            .fill(check.passed ? Color.green : Color.red)
                            .frame(width: 10, height: 10)
                            .padding(.top, 4)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(check.label)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.white)
                            Text(check.detail)
                                .font(.caption)
                                .foregroundStyle(.white.opacity(0.72))
                        }
                        Spacer()
                    }
                    .padding(.vertical, 3)
                }
            }
        }
        .padding(16)
        .background(Color.black.opacity(0.28), in: RoundedRectangle(cornerRadius: 18))
    }

    private var historyCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Decision Trace")
                .font(.headline)
                .foregroundStyle(.white)

            if autoPark.decisionHistory.isEmpty {
                Text("No trigger decisions yet")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.7))
            } else {
                ForEach(Array(autoPark.decisionHistory.prefix(12))) { item in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(item.timestamp.formatted(date: .omitted, time: .standard))
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.white.opacity(0.72))
                            .frame(width: 76, alignment: .leading)

                        Text(item.decision.replacingOccurrences(of: "_", with: " "))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(colorForDecision(item.decision))

                        Text(item.reason.replacingOccurrences(of: "_", with: " "))
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.85))

                        Spacer(minLength: 0)
                    }
                }
            }
        }
        .padding(16)
        .background(Color.black.opacity(0.28), in: RoundedRectangle(cornerRadius: 18))
    }

    private func metricPill(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.6))
            Text(value)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
    }

    private func telemetryRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.caption)
                .foregroundStyle(.white.opacity(0.72))
            Spacer()
            Text(value)
                .font(.caption.monospacedDigit())
                .foregroundStyle(.white)
        }
    }

    private func formatDouble(_ value: Double?, digits: Int = 1, suffix: String = "") -> String {
        guard let value else { return "n/a" }
        return String(format: "%.*f%@", digits, value, suffix)
    }

    private func formatSpeed(_ value: Double?) -> String {
        guard let value else { return "n/a" }
        if value < 0 {
            return "unavailable"
        }
        let mph = value * 2.23694
        return String(format: "%.2f m/s (%.1f mph)", value, mph)
    }

    private func colorForDecision(_ decision: String) -> Color {
        switch decision {
        case "session_started": return .green
        case "queued_offline": return .yellow
        case "needs_confirmation": return .orange
        case "ready_to_start": return .mint
        default: return .red
        }
    }
}
