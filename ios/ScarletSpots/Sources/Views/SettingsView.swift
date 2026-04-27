import SwiftUI
import CoreLocation
import Combine
import Charts

/// Profile / Settings tab.
///
/// Rebuilt to mirror the polished RN profile presentation:
/// - Rich profile hero card with initial avatar, permit CTA, and member-since.
/// - High-signal metric strip (favorites, friends, lifetime sessions).
/// - Better section hierarchy with modern cards + collapsible controls.
/// - Live diagnostics dashboard entry point for Auto-Park telemetry.
struct ProfileView: View {
    @EnvironmentObject private var tabBarState: TabBarState
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.colorScheme) private var colorScheme
    @AppStorage("theme_mode_v1") private var themeMode = "system"
    @StateObject private var lotRepository = LotRepository.shared
    @StateObject private var offlineQueue = OfflineQueue.shared
    @StateObject private var location = LocationEngine.shared
    @StateObject private var autoPark = AutoParkCoordinator.shared
    @StateObject private var session = NativeSessionStore.shared
    @StateObject private var webSocket = WebSocketManager.shared

    @State private var favorites: [String] = []
    @State private var favoritesLoading = true
    @State private var friendsCount = 0
    @State private var sessionsCount = 0
    @State private var showFeedback = false
    @State private var showSignOutConfirm = false
    @State private var showDeleteConfirm = false
    @State private var deleteError: String?
    @State private var isDeleting = false
    @State private var expandedCampuses = false
    @State private var expandedTheme = false
    @State private var expandedLegal = false
    @State private var diagnosticsSamples: [Double] = []
    @State private var notificationStatusLabel = "unknown"
    @State private var notificationReady = false

    /// Canonical legal URLs — published copies live on the marketing site.
    private let privacyPolicyURL = URL(string: "https://scarletspots.com/privacy")!
    private let termsURL = URL(string: "https://scarletspots.com/terms")!
    private let supportURL = URL(string: "https://scarletspots.com/support")!
    private let diagnosticsTicker = Timer.publish(every: 2.0, on: .main, in: .common).autoconnect()

    private var isDark: Bool { colorScheme == .dark }
    private var primaryText: Color { isDark ? .white : Color(hex: 0x111827) }
    private var secondaryText: Color { isDark ? .white.opacity(0.56) : Color(hex: 0x6B7280) }
    private var tertiaryText: Color { isDark ? .white.opacity(0.45) : Color(hex: 0x9CA3AF) }
    private var cardFill: Color { isDark ? Color.white.opacity(0.06) : Color.white.opacity(0.92) }
    private var cardStroke: Color { isDark ? Color.white.opacity(0.10) : Color.black.opacity(0.08) }
    private var dividerColor: Color { isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.08) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    heroCard
                    statsStrip
                    favoritesSection
                    backgroundReadinessSection
                    campusesSection
                    appearanceSection
                    diagnosticsSection
                    feedbackSection
                    legalSection
                    accountActionsSection
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 34)
            }
            .background(
                LinearGradient(
                    colors: isDark
                        ? [Color(hex: 0x08090E), Color(hex: 0x12050A), Color(hex: 0x22050E)]
                        : [Color(hex: 0xF8FAFC), Color(hex: 0xFFF7F7), Color(hex: 0xF3F4F6)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()
            )
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .task { await refreshAll() }
            .refreshable { await refreshAll() }
            .onAppear {
                seedDiagnosticsIfNeeded()
                refreshNotificationReadiness()
            }
            .onReceive(diagnosticsTicker) { _ in
                appendDiagnosticsSample()
            }
            .sheet(isPresented: $showFeedback) {
                if let recentSession = session.activeSession {
                    FeedbackSheet(session: recentSession)
                        .presentationDetents([.medium])
                }
            }
            .confirmationDialog(
                "Sign out of ScarletSpots?",
                isPresented: $showSignOutConfirm,
                titleVisibility: .visible
            ) {
                Button("Sign Out", role: .destructive) {
                    Task {
                        await PushRegistration.shared.clearOnSignOut()
                        await authManager.signOut()
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("You'll need to sign in again to park and sync data.")
            }
            .confirmationDialog(
                "Delete your account?",
                isPresented: $showDeleteConfirm,
                titleVisibility: .visible
            ) {
                Button("Delete Account", role: .destructive) { performDelete() }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This permanently removes your profile, favorites, parking history, and friendships. This cannot be undone.")
            }
            .alert("Couldn't delete account", isPresented: Binding(
                get: { deleteError != nil },
                set: { if !$0 { deleteError = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(deleteError ?? "")
            }
        }
    }

    // MARK: - Top sections

    private var heroCard: some View {
        let user = authManager.currentUser
        let displayName = fullName(for: user)
        let initial = displayName.first.map { String($0).uppercased() } ?? "?"
        let permitText = Self.prettyPermit(authManager.permitType)

        return ZStack(alignment: .bottomLeading) {
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: isDark
                            ? [Color(hex: 0x2A070E), Color(hex: 0x14080D), Color(hex: 0x0A0F16)]
                            : [Color(hex: 0xFFF4F4), Color(hex: 0xFFFFFF), Color(hex: 0xF8FAFC)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .overlay {
                    RoundedRectangle(cornerRadius: 26, style: .continuous)
                        .stroke(isDark ? Color.white.opacity(0.10) : Color.black.opacity(0.08), lineWidth: 1)
                }
                .shadow(color: Color(hex: 0xCC0033).opacity(0.22), radius: 24, y: 8)

            Circle()
                .fill(Color(hex: 0xCC0033).opacity(0.16))
                .frame(width: 160, height: 160)
                .offset(x: 46, y: -68)
                .blur(radius: 1)

            VStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(isDark ? Color(hex: 0x0A0F16) : .white)
                    Circle()
                        .stroke(Color(hex: 0xEF4444).opacity(0.75), lineWidth: 2)
                    Text(initial)
                        .font(.system(size: 45, weight: .black, design: .rounded))
                        .italic()
                        .foregroundStyle(Color(hex: 0xEF4444))
                }
                .frame(width: 112, height: 112)
                .shadow(color: Color(hex: 0xEF4444).opacity(0.28), radius: 14, y: 6)

                Text(displayName)
                    .font(.system(size: 36, weight: .heavy, design: .rounded))
                    .minimumScaleFactor(0.72)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .lineSpacing(1)
                    .kerning(-0.2)
                    .foregroundStyle(primaryText)

                Text(user?.email ?? "Unknown email")
                    .font(.subheadline)
                    .foregroundStyle(secondaryText)

                NavigationLink {
                    PermitOnboardingView(fromProfile: true)
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "p.circle.fill")
                        Text(permitText)
                        Image(systemName: "chevron.right")
                            .font(.caption.bold())
                    }
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Color(hex: 0xEF4444))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Color(hex: 0x33070F), in: Capsule())
                    .overlay(Capsule().stroke(Color(hex: 0xEF4444).opacity(0.30), lineWidth: 1))
                }
                .buttonStyle(.plain)

                if let createdAt = user?.createdAt {
                    Text("MEMBER SINCE \(monthYearFormatter.string(from: createdAt).uppercased())")
                        .font(.caption2.weight(.semibold))
                        .kerning(1.0)
                        .foregroundStyle(tertiaryText)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 22)
            .padding(.horizontal, 20)
        }
    }

    private var statsStrip: some View {
        HStack(spacing: 10) {
            statTile(title: "Favorites", value: "\(favorites.count)", accent: NativeAuthColors.occupancyHigh)
            statTile(title: "Friends", value: "\(friendsCount)", accent: Color(hex: 0x60A5FA))
            statTile(title: "Sessions", value: "\(sessionsCount)", accent: NativeAuthColors.occupancyLow)
        }
    }

    private func statTile(title: String, value: String, accent: Color) -> some View {
        VStack(spacing: 8) {
            Text(value)
                .font(.system(size: 34, weight: .heavy, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .foregroundStyle(accent)
            Text(title.uppercased())
                .font(.caption.weight(.semibold))
                .kerning(0.8)
                .foregroundStyle(secondaryText)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(cardFill)
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(cardStroke, lineWidth: 1)
                )
        )
    }

    // MARK: - Content sections

    private var backgroundReadinessSection: some View {
        let authed = authManager.isAuthenticated
        let alwaysLocation = location.hasBackgroundPermission
        let armed = autoPark.isRunning
        let readiness = authed && alwaysLocation && notificationReady && armed
        let readinessText = readiness ? "Armed" : "Needs Attention"
        let readinessColor = readiness ? NativeAuthColors.occupancyLow : NativeAuthColors.occupancyHigh
        let wakeReason = autoPark.liveSnapshot.wakeReason.replacingOccurrences(of: "_", with: " ")
        let wakeAt = autoPark.liveSnapshot.timestamp.formatted(date: .omitted, time: .shortened)

        return profileCard(
            title: "Background Readiness",
            subtitle: "Whether auto-start/end can run when app is not open."
        ) {
            VStack(spacing: 10) {
                HStack(spacing: 8) {
                    Circle()
                        .fill(readinessColor)
                        .frame(width: 10, height: 10)
                        .shadow(color: readinessColor.opacity(0.4), radius: 6)
                    Text(readinessText.uppercased())
                        .font(.caption.weight(.bold))
                        .kerning(0.7)
                        .foregroundStyle(primaryText)
                    Spacer()
                    Text("Last wake: \(wakeAt)")
                        .font(.caption2)
                        .foregroundStyle(tertiaryText)
                }

                readinessRow(
                    title: "Signed in",
                    value: authed ? "Ready" : "Required",
                    isReady: authed
                )
                readinessRow(
                    title: "Always Location",
                    value: alwaysLocation ? "Ready" : "Required",
                    isReady: alwaysLocation
                )
                readinessRow(
                    title: "Notifications",
                    value: notificationStatusLabel,
                    isReady: notificationReady
                )
                readinessRow(
                    title: "Auto-Park Engine",
                    value: armed ? "Running" : "Not armed",
                    isReady: armed
                )
                readinessRow(
                    title: "Latest wake reason",
                    value: wakeReason,
                    isReady: true
                )

                Text("iOS may pause background relaunch after a force-quit. Users should open the app once after install/sign-in so auto-park can arm.")
                    .font(.caption)
                    .foregroundStyle(secondaryText)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 2)
            }
            .task {
                refreshNotificationReadiness()
            }
        }
    }

    private func readinessRow(title: String, value: String, isReady: Bool) -> some View {
        HStack(spacing: 8) {
            Image(systemName: isReady ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundStyle(isReady ? NativeAuthColors.occupancyLow : NativeAuthColors.occupancyHigh)
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(primaryText)
            Spacer()
            Text(value)
                .font(.caption.weight(.semibold))
                .foregroundStyle(secondaryText)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(
            isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04),
            in: RoundedRectangle(cornerRadius: 10, style: .continuous)
        )
    }

    private var favoritesSection: some View {
        profileCard(title: "Saved Lots", subtitle: "Quick access to your starred lots.") {
            if favoritesLoading {
                ForEach(0..<2, id: \.self) { index in
                    favoriteRowPlaceholder
                    if index == 0 { Divider().overlay(Color.white.opacity(0.08)) }
                }
            } else if favorites.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "star")
                        .font(.system(size: 28, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.45))
                    Text("No saved lots")
                        .font(.headline)
                        .foregroundStyle(.white.opacity(0.72))
                    Text("Long-press any lot on the map to save it.")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.45))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 24)
            } else {
                ForEach(favorites, id: \.self) { id in
                    favoriteRow(id: id)
                    if id != favorites.last {
                        Divider().overlay(Color.white.opacity(0.08))
                    }
                }
            }
        }
    }

    private var campusesSection: some View {
        profileCard(title: "Campuses", subtitle: "Toggle lots visible on the map.") {
            DisclosureGroup(
                isExpanded: Binding(
                    get: { expandedCampuses },
                    set: { newValue in
                        withAnimation(.spring(response: 0.38, dampingFraction: 0.84)) {
                            expandedCampuses = newValue
                        }
                    }
                )
            ) {
                VStack(spacing: 0) {
                    campusToggle("Busch")
                    sectionDivider
                    campusToggle("College Ave")
                    sectionDivider
                    campusToggle("Livingston")
                    sectionDivider
                    campusToggle("Cook")
                    sectionDivider
                    campusToggle("Douglass")
                    sectionDivider
                    campusToggle("Health - Piscataway")
                    sectionDivider
                    campusToggle("Health - New Brunswick")
                }
                .padding(.top, 8)
            } label: {
                HStack {
                    Label("Campus Filters", systemImage: "map")
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Text(campusFilterSummary)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(secondaryText)
                        .fixedSize(horizontal: true, vertical: false)
                }
                .foregroundStyle(primaryText)
                .padding(.trailing, 2)
            }
        }
    }

    private var appearanceSection: some View {
        profileCard(title: "Appearance", subtitle: "Light, dark, or automatic.") {
            DisclosureGroup(
                isExpanded: Binding(
                    get: { expandedTheme },
                    set: { newValue in
                        withAnimation(.spring(response: 0.38, dampingFraction: 0.84)) {
                            expandedTheme = newValue
                        }
                    }
                )
            ) {
                Picker("Theme", selection: $themeMode) {
                    Text("System").tag("system")
                    Text("Light").tag("light")
                    Text("Dark").tag("dark")
                }
                .pickerStyle(.segmented)
                .padding(.top, 8)
            } label: {
                HStack {
                    Label("Theme", systemImage: "circle.lefthalf.filled")
                    Spacer()
                    Text(themeLabel(themeMode))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(secondaryText)
                        .fixedSize(horizontal: true, vertical: false)
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(primaryText)
                .padding(.trailing, 2)
            }
        }
    }

    private var diagnosticsSection: some View {
        profileCard(title: "Diagnostics", subtitle: "Auto-Park signal intelligence.") {
            let snapshot = autoPark.liveSnapshot
            let hasRecentTrigger = snapshot.triggerSource != nil
                || snapshot.phase == "trigger_received"
                || snapshot.phase == "decision"
                || snapshot.phase == "mutation"
            let blockedCount = autoPark.decisionHistory.filter { $0.decision == "blocked" }.count
            let startedCount = autoPark.decisionHistory.filter { $0.decision == "session_started" }.count
            let endedCount = autoPark.decisionHistory.filter { $0.decision == "session_ended" }.count
            VStack(spacing: 12) {
                HStack(spacing: 8) {
                    diagnosticsStatusLight(
                        title: snapshot.monitoringMode,
                        isOn: autoPark.isRunning,
                        onColor: NativeAuthColors.occupancyLow
                    )
                    diagnosticsStatusLight(
                        title: snapshot.wakeReason,
                        isOn: hasRecentTrigger,
                        onColor: .blue
                    )
                    diagnosticsStatusLight(
                        title: snapshot.sessionTruthSource,
                        isOn: snapshot.sessionTruthSource != NativeSessionStore.TruthSource.none.rawValue,
                        onColor: NativeAuthColors.occupancyMedium
                    )
                }

                HStack(spacing: 10) {
                    diagnosticGauge(
                        title: "Started",
                        value: "\(startedCount)",
                        normalized: min(Double(startedCount) / 8.0, 1.0)
                    )
                    diagnosticGauge(
                        title: "Ended",
                        value: "\(endedCount)",
                        normalized: min(Double(endedCount) / 8.0, 1.0)
                    )
                    diagnosticGauge(
                        title: "Blocked",
                        value: "\(blockedCount)",
                        normalized: min(Double(blockedCount) / 8.0, 1.0)
                    )
                }

                diagnosticsSparkline
                    .frame(height: 52)
                    .padding(.horizontal, 2)
                    .overlay(alignment: .topLeading) {
                        Text("Signal Trace")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(secondaryText)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(
                                isDark ? Color.black.opacity(0.25) : Color.white.opacity(0.92),
                                in: Capsule()
                            )
                    }
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.03))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .stroke(dividerColor, lineWidth: 1)
                            )
                    )

                HStack {
                    Label(snapshot.explanation, systemImage: snapshot.decisionKind == "end" ? "figure.walk.motion" : "car.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(primaryText)
                        .lineLimit(2)
                    Spacer()
                    Text(snapshot.timestamp.formatted(date: .omitted, time: .standard))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(tertiaryText)
                }

                VStack(alignment: .leading, spacing: 6) {
                    infoPill(label: "Decision", value: snapshot.decision.replacingOccurrences(of: "_", with: " "))
                    infoPill(label: "Reason", value: snapshot.reason.replacingOccurrences(of: "_", with: " "))
                    infoPill(label: "Trigger", value: snapshot.triggerSource ?? "none")
                    infoPill(label: "Lot", value: snapshot.lotName ?? snapshot.lotId ?? "unknown")
                    infoPill(label: "Queue", value: snapshot.queueTypes.isEmpty ? "empty" : snapshot.queueTypes.joined(separator: ", "))
                    if let failure = snapshot.lastFailure, !failure.isEmpty {
                        infoPill(label: "Last failure", value: failure)
                    }
                }

                HStack(spacing: 10) {
                    Button {
                        Task { await autoPark.refreshSessionTruth() }
                    } label: {
                        Label("Refresh Session Truth", systemImage: "arrow.clockwise")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(primaryText)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 9)
                    }
                    .buttonStyle(.plain)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))
                    )

                    Button {
                        autoPark.clearDiagnostics()
                    } label: {
                        Label("Clear History", systemImage: "trash")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(primaryText)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 9)
                    }
                    .buttonStyle(.plain)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))
                    )
                }

                NavigationLink {
                    AutoParkInsightsView()
                } label: {
                    HStack {
                        Text("Open Live Sensor Dashboard")
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption.bold())
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(primaryText)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(
                        isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04),
                        in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(dividerColor, lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
            }
            .task {
                autoPark.refreshLiveSnapshot()
            }
        }
    }

    private func infoPill(label: String, value: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(label.uppercased())
                .font(.caption2.weight(.bold))
                .foregroundStyle(secondaryText)
                .frame(width: 92, alignment: .leading)
            Text(value)
                .font(.caption)
                .foregroundStyle(primaryText)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(
            isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04),
            in: RoundedRectangle(cornerRadius: 10, style: .continuous)
        )
    }

    private func diagnosticGauge(title: String, value: String, normalized: Double) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Gauge(value: normalized) {
                EmptyView()
            } currentValueLabel: {
                Text(value)
                    .font(.system(size: 15, weight: .bold, design: .monospaced))
                    .foregroundStyle(primaryText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .gaugeStyle(.accessoryLinearCapacity)
            .tint(
                LinearGradient(
                    colors: [NativeAuthColors.occupancyLow, Color(hex: 0x60A5FA), NativeAuthColors.occupancyHigh],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )

            Text(title.uppercased())
                .font(.caption2.weight(.semibold))
                .kerning(0.7)
                .foregroundStyle(secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 10)
        .background(
            isDark ? Color.white.opacity(0.07) : Color.black.opacity(0.04),
            in: RoundedRectangle(cornerRadius: 12, style: .continuous)
        )
    }

    private func diagnosticsStatusLight(title: String, isOn: Bool, onColor: Color) -> some View {
        HStack(spacing: 7) {
            Circle()
                .fill(isOn ? onColor : (isDark ? Color.white.opacity(0.22) : Color.black.opacity(0.16)))
                .frame(width: 8, height: 8)
                .shadow(color: isOn ? onColor.opacity(0.45) : .clear, radius: 6)
            Text(title.uppercased())
                .font(.caption2.weight(.semibold))
                .kerning(0.6)
                .foregroundStyle(secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(
            isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04),
            in: RoundedRectangle(cornerRadius: 10, style: .continuous)
        )
    }

    private var diagnosticsSparkline: some View {
        let values = diagnosticsSamples.isEmpty ? [0.2, 0.4, 0.3, 0.55, 0.48] : diagnosticsSamples
        return Chart(Array(values.enumerated()), id: \.offset) { entry in
            AreaMark(
                x: .value("Sample", entry.offset),
                y: .value("Signal", entry.element)
            )
            .foregroundStyle(
                LinearGradient(
                    colors: [NativeAuthColors.occupancyLow.opacity(0.22), .clear],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )

            LineMark(
                x: .value("Sample", entry.offset),
                y: .value("Signal", entry.element)
            )
            .foregroundStyle(
                LinearGradient(
                    colors: [NativeAuthColors.occupancyLow, Color(hex: 0x60A5FA), NativeAuthColors.occupancyHigh],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .lineStyle(StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
        }
        .chartYAxis(.hidden)
        .chartXAxis(.hidden)
        .chartLegend(.hidden)
    }

    private var feedbackSection: some View {
        profileCard(title: "Feedback", subtitle: "Rate your latest parking session.") {
            Button { showFeedback = true } label: {
                HStack {
                    Label("Send Session Feedback", systemImage: "paperplane.fill")
                        .foregroundStyle(primaryText)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption.bold())
                        .foregroundStyle(tertiaryText)
                }
                .padding(.vertical, 4)
            }
            .buttonStyle(.plain)
            .disabled(session.activeSession == nil)
            .opacity(session.activeSession == nil ? 0.45 : 1)
        }
    }

    private var legalSection: some View {
        DisclosureGroup(
            isExpanded: Binding(
                get: { expandedLegal },
                set: { newValue in
                    withAnimation(.spring(response: 0.38, dampingFraction: 0.84)) {
                        expandedLegal = newValue
                    }
                }
            )
        ) {
            VStack(spacing: 0) {
                legalLink(label: "Privacy Policy", systemImage: "hand.raised", url: privacyPolicyURL)
                sectionDivider
                legalLink(label: "Terms of Service", systemImage: "doc.text", url: termsURL)
                sectionDivider
                legalLink(label: "Support", systemImage: "lifepreserver", url: supportURL)
                sectionDivider
                HStack {
                    Text("Version")
                        .foregroundStyle(primaryText)
                    Spacer()
                    Text(Self.versionString)
                        .foregroundStyle(secondaryText)
                }
                .font(.subheadline)
                .padding(.vertical, 10)
            }
            .padding(.top, 10)
        } label: {
            HStack(spacing: 12) {
                Label("Legal & Support", systemImage: "hand.raised.circle")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(primaryText)
                Spacer()
                Text(expandedLegal ? "Hide" : "Show")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(tertiaryText)
                    .textCase(.uppercase)
            }
        }
        .tint(primaryText)
        .padding(.horizontal, 2)
        .padding(.top, 2)
    }

    private var accountActionsSection: some View {
        VStack(spacing: 12) {
            Button { showSignOutConfirm = true } label: {
                Text("Sign Out")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(NativeAuthColors.occupancyHigh, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }

            Button(role: .destructive) { showDeleteConfirm = true } label: {
                Text(isDeleting ? "Deleting..." : "Delete Account")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.red.opacity(0.9))
            }
            .disabled(isDeleting)
        }
    }

    // MARK: - Shared card / rows

    private func profileCard<Content: View>(
        title: String,
        subtitle: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(primaryText)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(secondaryText)
            }

            content()
        }
        .padding(15)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(cardFill)
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(cardStroke, lineWidth: 1)
                )
        )
    }

    private var sectionDivider: some View {
        Divider().overlay(dividerColor)
    }

    @ViewBuilder
    private var favoriteRowPlaceholder: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Loading lot")
            Text("Loading full name")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 8)
        .redacted(reason: .placeholder)
    }

    @ViewBuilder
    private func favoriteRow(id: String) -> some View {
        let lot = lotRepository.byId(id)
        HStack(spacing: 10) {
            Button {
                guard lot != nil else { return }
                tabBarState.focusLotId = id
                tabBarState.selectedTab = 1
            } label: {
                HStack(spacing: 10) {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Color.white.opacity(0.08))
                        .overlay(
                            Image(systemName: "car.fill")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(secondaryText)
                        )
                        .frame(width: 36, height: 36)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(lot?.shortName ?? id)
                            .font(.subheadline.bold())
                            .foregroundStyle(primaryText)
                        Text(lotSubtitle(for: lot))
                            .font(.caption)
                            .foregroundStyle(secondaryText)
                            .lineLimit(1)
                    }
                    Spacer()
                }
            }
            .buttonStyle(.plain)

            if let lot {
                if let row = webSocket.lotOccupancyRows[lot.mapId], !row.isLivePrimary {
                    OccupancyPill(
                        estimatedRate: min(100, row.displayRate),
                        sourceLabel: row.sourceSummary
                    )
                } else {
                    let capacity = max(lot.totalSpaces, 1)
                    let occupancy = webSocket.lotOccupancies[lot.mapId] ?? 0
                    let rate = Double(occupancy) / Double(capacity) * 100
                    OccupancyPill(rate: min(rate, 100))
                }
            }

            Button {
                Task {
                    try? await FavoritesAPI.remove(lotId: id)
                    favorites.removeAll { $0 == id }
                    OfflineCache.shared.cacheFavorites(favorites)
                }
            } label: {
                Image(systemName: "star.fill")
                    .foregroundStyle(.yellow)
                    .frame(width: 30, height: 30)
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 6)
    }

    private func lotSubtitle(for lot: Lot?) -> String {
        guard let lot else { return "Loading lot metadata" }
        let campus = lot.address.campus ?? "Rutgers"
        let spots = lot.totalSpaces
        let unit = spots == 1 ? "spot" : "spots"
        return "\(campus) · \(spots) \(unit)"
    }

    private func legalLink(label: String, systemImage: String, url: URL) -> some View {
        Link(destination: url) {
            HStack {
                Label(label, systemImage: systemImage)
                    .foregroundStyle(primaryText)
                Spacer()
                Image(systemName: "arrow.up.right")
                    .font(.caption.bold())
                    .foregroundStyle(tertiaryText)
            }
            .font(.subheadline)
            .padding(.vertical, 10)
        }
    }

    // MARK: - Actions

    private func refreshAll() async {
        favoritesLoading = true
        async let favoritesTask: [String] = {
            (try? await FavoritesAPI.list()) ?? OfflineCache.shared.getCachedFavorites()
        }()
        async let friendsTask: Int = {
            let response = try? await FriendsAPI.list()
            return response?.friends.count ?? 0
        }()
        async let sessionsTask: Int = {
            let export = try? await UsersAPI.exportData()
            return export?.sessions.count ?? 0
        }()

        let loadedFavorites = await favoritesTask
        favorites = loadedFavorites
        OfflineCache.shared.cacheFavorites(loadedFavorites)
        friendsCount = await friendsTask
        sessionsCount = await sessionsTask
        favoritesLoading = false
        seedDiagnosticsIfNeeded()
    }

    private func performDelete() {
        isDeleting = true
        Task {
            defer { isDeleting = false }
            do {
                try await authManager.deleteAccount()
            } catch {
                deleteError = error.localizedDescription
            }
        }
    }

    private static var versionString: String {
        let info = Bundle.main.infoDictionary ?? [:]
        let v = info["CFBundleShortVersionString"] as? String ?? "1.0"
        let b = info["CFBundleVersion"] as? String ?? "0"
        return "\(v) (\(b))"
    }

    // MARK: - Helpers

    @ViewBuilder
    private func campusToggle(_ campus: String) -> some View {
        Toggle(campus, isOn: Binding(
            get: { authManager.enabledCampuses.contains(campus) },
            set: { _ in authManager.toggleCampus(campus) }
        ))
        .tint(Color(hex: 0xCC0033))
        .foregroundStyle(primaryText)
        .font(.subheadline)
        .padding(.vertical, 7)
        .padding(.trailing, 8)
        .accessibilityHint("Show or hide \(campus) lots on the map.")
    }

    private func themeLabel(_ mode: String) -> String {
        switch mode {
        case "light": return "Light"
        case "dark": return "Dark"
        default: return "System"
        }
    }

    private var campusFilterSummary: String {
        let count = authManager.enabledCampuses.count
        if count == 0 { return "Off" }
        if count == 1 { return "1 enabled" }
        return "\(count) enabled"
    }

    private func fullName(for profile: Profile?) -> String {
        let composed = [profile?.firstName, profile?.lastName]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        if !composed.isEmpty { return composed }
        if let email = profile?.email, !email.isEmpty {
            return String(email.split(separator: "@").first ?? "ScarletSpots")
        }
        return "ScarletSpots"
    }

    private var monthYearFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = .current
        formatter.dateFormat = "MMMM yyyy"
        return formatter
    }

    private func formatSpeedShort(_ value: Double?) -> String {
        guard let value else { return "n/a" }
        if value < 0 { return "n/a" }
        let mph = value * 2.23694
        return String(format: "%.1f mph", mph)
    }

    private func formatImperialDistanceShort(_ meters: Double?) -> String {
        guard let meters else { return "n/a" }
        guard meters >= 0 else { return "n/a" }
        let feet = meters * 3.28084
        if feet < 1000 {
            return "\(Int(feet.rounded())) ft"
        }
        let miles = feet / 5280
        if miles < 10 {
            return String(format: "%.1f mi", miles)
        }
        return "\(Int(miles.rounded())) mi"
    }

    private func seedDiagnosticsIfNeeded() {
        guard diagnosticsSamples.isEmpty else { return }
        diagnosticsSamples = [0.22, 0.28, 0.31, 0.36, 0.33, 0.42, 0.39, 0.45]
    }

    private func appendDiagnosticsSample() {
        let snapshot = autoPark.liveSnapshot
        let speed = max(0, snapshot.speedMetersPerSecond ?? 0)
        let speedNormalized = min(speed / 14.0, 1.0)
        let queueNormalized = min(Double(snapshot.queueDepth) / 8.0, 1.0)
        let accuracyValue = snapshot.horizontalAccuracy ?? 0
        let accuracyPenalty = min(max(accuracyValue, 0) / 120.0, 1.0)
        let sample = max(0.05, min(0.95, (speedNormalized * 0.55) + (queueNormalized * 0.25) + ((1 - accuracyPenalty) * 0.20)))
        diagnosticsSamples.append(sample)
        if diagnosticsSamples.count > 24 {
            diagnosticsSamples.removeFirst(diagnosticsSamples.count - 24)
        }
    }

    private func refreshNotificationReadiness() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            Task { @MainActor in
                switch settings.authorizationStatus {
                case .authorized:
                    notificationReady = true
                    notificationStatusLabel = "Authorized"
                case .provisional:
                    notificationReady = true
                    notificationStatusLabel = "Provisional"
                case .ephemeral:
                    notificationReady = true
                    notificationStatusLabel = "Ephemeral"
                case .denied:
                    notificationReady = false
                    notificationStatusLabel = "Denied"
                case .notDetermined:
                    notificationReady = false
                    notificationStatusLabel = "Not granted"
                @unknown default:
                    notificationReady = false
                    notificationStatusLabel = "Unknown"
                }
            }
        }
    }

    static func prettyPermit(_ raw: String?) -> String {
        PermitRepository.displayName(for: raw)
    }
}

/// Lightweight feedback form persisted via `ParkAPI.sendFeedback`.
private struct FeedbackSheet: View {
    let session: ParkingSession
    @Environment(\.dismiss) private var dismiss
    @State private var rating = 4
    @State private var notes = ""
    @State private var isSending = false
    @State private var sendError: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Rating") {
                    HStack {
                        ForEach(1...5, id: \.self) { i in
                            Image(systemName: i <= rating ? "star.fill" : "star")
                                .foregroundStyle(.yellow)
                                .onTapGesture { rating = i }
                        }
                    }
                    .font(.title2)
                }
                Section("Notes") {
                    TextEditor(text: $notes)
                        .frame(minHeight: 80)
                }
                if let sendError {
                    Section {
                        Text(sendError)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Session Feedback")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") {
                        Task {
                            isSending = true
                            defer { isSending = false }
                            do {
                                try await ParkAPI.sendFeedback(
                                    sessionId: session.id,
                                    lotId: session.lotId,
                                    rating: rating,
                                    notes: notes.isEmpty ? nil : notes
                                )
                                dismiss()
                            } catch {
                                sendError = error.localizedDescription
                            }
                        }
                    }
                    .disabled(isSending)
                }
            }
        }
    }
}
