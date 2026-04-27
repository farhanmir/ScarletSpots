import SwiftUI
import UIKit

/// Live explainability panel for Auto-Park and Auto-End decisions.
struct AutoParkInsightsView: View {
    @StateObject private var autoPark = AutoParkCoordinator.shared
    @State private var exportToast: String?
    @State private var showClearLogConfirm = false

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                statusHeader
                exportCard
                telemetryCard
                checksCard
                queueCard
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
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Clear") {
                    autoPark.clearDiagnostics()
                }
                .foregroundStyle(.white)
            }
            ToolbarItem(placement: .topBarLeading) {
                Button("Export") {
                    copyDebugReport()
                }
                .foregroundStyle(.white)
            }
        }
        .task {
            autoPark.refreshLiveSnapshot()
        }
        .overlay(alignment: .bottom) {
            if let exportToast {
                Text(exportToast)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.black.opacity(0.78), in: Capsule())
                    .padding(.bottom, 18)
            }
        }
        .confirmationDialog(
            "Clear diagnostic logs?",
            isPresented: $showClearLogConfirm,
            titleVisibility: .visible
        ) {
            Button("Clear logs", role: .destructive) {
                Logger.clear()
                showToast("Auto-Park logs cleared")
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This clears the in-app structured log buffer used for debugging.")
        }
    }

    private var exportCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Debug Export")
                .font(.headline)
                .foregroundStyle(.white)
            Text("Copies a machine-readable Auto-Park report (snapshot + decisions + structured logs) to your clipboard. Paste it into an LLM for root-cause analysis.")
                .font(.caption)
                .foregroundStyle(.white.opacity(0.72))
            HStack(spacing: 10) {
                actionButton("Copy Debug Report", systemName: "doc.on.doc") {
                    copyDebugReport()
                }
                actionButton("Clear Logs", systemName: "trash") {
                    showClearLogConfirm = true
                }
            }
        }
        .padding(16)
        .background(Color.black.opacity(0.28), in: RoundedRectangle(cornerRadius: 18))
    }

    private var statusHeader: some View {
        let snapshot = autoPark.liveSnapshot
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center) {
                Image(systemName: snapshot.decisionKind == "end" ? "figure.walk.motion" : "car.side.fill")
                    .font(.title2)
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(Color.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))

                VStack(alignment: .leading, spacing: 2) {
                    Text(snapshot.decision.replacingOccurrences(of: "_", with: " ").uppercased())
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(.white)
                    Text(snapshot.explanation)
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.75))
                        .lineLimit(3)
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
                metricPill("Mode", snapshot.monitoringMode)
                metricPill("Wake", snapshot.wakeReason)
                metricPill("Kind", snapshot.decisionKind)
                metricPill("Source", snapshot.triggerSource ?? "none")
            }
        }
        .padding(16)
        .background(Color.black.opacity(0.28), in: RoundedRectangle(cornerRadius: 18))
    }

    private var telemetryCard: some View {
        let snapshot = autoPark.liveSnapshot
        return VStack(alignment: .leading, spacing: 10) {
            Text("Telemetry")
                .font(.headline)
                .foregroundStyle(.white)

            telemetryRow("Latitude", value: formatDouble(snapshot.latitude, digits: 6))
            telemetryRow("Longitude", value: formatDouble(snapshot.longitude, digits: 6))
            telemetryRow("Accuracy", value: formatDouble(snapshot.horizontalAccuracy, suffix: "m"))
            telemetryRow("Speed", value: formatSpeed(snapshot.speedMetersPerSecond))
            telemetryRow("Course", value: formatDouble(snapshot.courseDegrees, suffix: "°"))
            telemetryRow("Heading", value: formatDouble(snapshot.headingDegrees, suffix: "°"))
            telemetryRow("Location age", value: formatDouble(snapshot.locationAgeSeconds, suffix: "s"))
            telemetryRow("Cooldown", value: "\(Int(snapshot.cooldownRemainingSeconds.rounded()))s")
            telemetryRow("Wake reason", value: snapshot.wakeReason)
            telemetryRow("Session truth", value: snapshot.sessionTruthSource)
            telemetryRow("Lot", value: snapshot.lotName ?? snapshot.lotId ?? "n/a")
            telemetryRow("Active session", value: snapshot.activeSessionLotId ?? (snapshot.activeSessionPresent ? "yes" : "no"))
            telemetryRow("Auth", value: snapshot.locationAuthorizationLabel)
            telemetryRow("Always permission", value: snapshot.hasAlwaysLocationPermission ? "true" : "false")
            telemetryRow("Reduced accuracy", value: snapshot.reducedAccuracy ? "true" : "false")
            telemetryRow("Motion available", value: snapshot.motionAvailable ? "true" : "false")
            telemetryRow("Motion authorized", value: snapshot.motionAuthorized ? "true" : "false")
            telemetryRow("Driving", value: snapshot.isDriving ? "true" : "false")
            telemetryRow("Last disconnect", value: formatDouble(snapshot.lastAudioDisconnectSecondsAgo, suffix: "s"))
            telemetryRow("Last reconnect", value: formatDouble(snapshot.lastAudioReconnectSecondsAgo, suffix: "s"))
            if let failure = snapshot.lastFailure {
                telemetryRow("Last failure", value: failure)
            }
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
                            if let reasonCode = check.reasonCode, !reasonCode.isEmpty {
                                Text(reasonCode)
                                    .font(.caption2.monospaced())
                                    .foregroundStyle(.white.opacity(0.52))
                            }
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

    private var queueCard: some View {
        let snapshot = autoPark.liveSnapshot
        return VStack(alignment: .leading, spacing: 10) {
            Text("Queue State")
                .font(.headline)
                .foregroundStyle(.white)

            telemetryRow("Depth", value: "\(snapshot.queueDepth)")
            telemetryRow("Types", value: snapshot.queueTypes.isEmpty ? "none" : snapshot.queueTypes.joined(separator: ", "))
            telemetryRow("Endpoints", value: snapshot.queueEndpoints.isEmpty ? "none" : snapshot.queueEndpoints.joined(separator: ", "))
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
                ForEach(Array(autoPark.decisionHistory.prefix(20))) { item in
                    VStack(alignment: .leading, spacing: 3) {
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
                        Text("\(item.decisionKind.uppercased()) · \(item.wakeReason) · \(item.triggerSource ?? "no source")")
                            .font(.caption2.monospaced())
                            .foregroundStyle(.white.opacity(0.58))
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
        HStack(alignment: .top) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.white.opacity(0.72))
            Spacer()
            Text(value)
                .font(.caption.monospacedDigit())
                .foregroundStyle(.white)
                .multilineTextAlignment(.trailing)
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
        case "session_started", "session_ended": return .green
        case "queued_offline": return .yellow
        case "candidate_created", "trigger_received": return .orange
        case "monitoring", "idle": return .blue
        default: return .red
        }
    }

    private func actionButton(_ title: String, systemName: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemName)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 9)
                .background(Color.white.opacity(0.10), in: RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    private func copyDebugReport() {
        let report = buildDebugReportJSON()
        UIPasteboard.general.string = report
        showToast("Debug report copied")
    }

    private func showToast(_ message: String) {
        exportToast = message
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_700_000_000)
            if exportToast == message {
                exportToast = nil
            }
        }
    }

    private func buildDebugReportJSON() -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        let snapshot = autoPark.liveSnapshot
        let history = Array(autoPark.decisionHistory.prefix(120))
        let failedChecks = snapshot.checks.filter { !$0.passed }

        struct AutoParkDebugReport: Codable {
            let generatedAt: Date
            let appVersion: String
            let latestSnapshot: AutoParkLiveSnapshot
            let recentDecisionHistory: [AutoParkLiveSnapshot]
            let failedChecks: [AutoParkGateStatus]
            let structuredLogs: [Logger.LogEntry]
            let plainLogExport: String
        }

        let report = AutoParkDebugReport(
            generatedAt: Date(),
            appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown",
            latestSnapshot: snapshot,
            recentDecisionHistory: history,
            failedChecks: failedChecks,
            structuredLogs: Logger.recentEntries(limit: 300),
            plainLogExport: Logger.exportJSONString(limit: 300)
        )

        if let data = try? encoder.encode(report),
           let text = String(data: data, encoding: .utf8) {
            return text
        }
        return "{\"error\":\"failed_to_build_autopark_debug_report\"}"
    }
}
