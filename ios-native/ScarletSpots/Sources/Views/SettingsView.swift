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
    @State private var diagnosticsSamples: [Double] = []

    /// Canonical legal URLs — published copies live on the marketing site.
    private let privacyPolicyURL = URL(string: "https://scarletspots.com/privacy")!
    private let termsURL = URL(string: "https://scarletspots.com/terms")!
    private let supportURL = URL(string: "https://scarletspots.com/support")!
    private let diagnosticsTicker = Timer.publish(every: 2.0, on: .main, in: .common).autoconnect()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    heroCard
                    statsStrip
                    favoritesSection
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
                    colors: [Color(hex: 0x08090E), Color(hex: 0x12050A), Color(hex: 0x22050E)],
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
        let permitText = Self.prettyPermit(authManager.permitType ?? "No permit set")

        return ZStack(alignment: .bottomLeading) {
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [Color(hex: 0x2A070E), Color(hex: 0x14080D), Color(hex: 0x0A0F16)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .overlay {
                    RoundedRectangle(cornerRadius: 26, style: .continuous)
                        .stroke(Color.white.opacity(0.10), lineWidth: 1)
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
                        .fill(Color(hex: 0x0A0F16))
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
                    .foregroundStyle(.white)

                Text(user?.email ?? "Unknown email")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.74))

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
                        .foregroundStyle(.white.opacity(0.45))
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
                .foregroundStyle(.white.opacity(0.56))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.white.opacity(0.06))
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(Color.white.opacity(0.10), lineWidth: 1)
                )
        )
    }

    // MARK: - Content sections

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
                    campusToggle("Cook/Douglass")
                }
                .padding(.top, 8)
            } label: {
                HStack {
                    Label("Campus Filters", systemImage: "map")
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Text(campusFilterSummary)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.52))
                        .fixedSize(horizontal: true, vertical: false)
                }
                .foregroundStyle(.white.opacity(0.9))
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
                        .foregroundStyle(.white.opacity(0.52))
                        .fixedSize(horizontal: true, vertical: false)
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white.opacity(0.9))
                .padding(.trailing, 2)
            }
        }
    }

    private var diagnosticsSection: some View {
        profileCard(title: "Diagnostics", subtitle: "Auto-Park signal intelligence.") {
            let snapshot = autoPark.liveSnapshot
            VStack(spacing: 12) {
                HStack(spacing: 8) {
                    diagnosticsStatusLight(
                        title: "Drive",
                        isOn: snapshot.isDriving,
                        onColor: NativeAuthColors.occupancyLow
                    )
                    diagnosticsStatusLight(
                        title: "Always",
                        isOn: snapshot.hasAlwaysLocationPermission,
                        onColor: .blue
                    )
                    diagnosticsStatusLight(
                        title: "Queue",
                        isOn: snapshot.queueDepth > 0,
                        onColor: NativeAuthColors.occupancyMedium
                    )
                }

                HStack(spacing: 10) {
                    diagnosticGauge(
                        title: "Speed",
                        value: formatSpeedShort(snapshot.speedMetersPerSecond),
                        normalized: min(max((snapshot.speedMetersPerSecond ?? 0) / 20.0, 0), 1)
                    )
                    diagnosticGauge(
                        title: "Accuracy",
                        value: formatDouble(snapshot.horizontalAccuracy, suffix: "m"),
                        normalized: 1 - min(max((snapshot.horizontalAccuracy ?? 120) / 120.0, 0), 1)
                    )
                    diagnosticGauge(
                        title: "Queue",
                        value: "\(snapshot.queueDepth)",
                        normalized: min(Double(snapshot.queueDepth) / 8.0, 1.0)
                    )
                }

                diagnosticsSparkline
                    .frame(height: 52)
                    .padding(.horizontal, 2)
                    .overlay(alignment: .topLeading) {
                        Text("Signal Trace")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.white.opacity(0.46))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.black.opacity(0.25), in: Capsule())
                    }
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(Color.white.opacity(0.04))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
                            )
                    )

                HStack {
                    Label(snapshot.isDriving ? "Vehicle moving" : "Vehicle stopped", systemImage: snapshot.isDriving ? "car.fill" : "pause.circle.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(snapshot.isDriving ? NativeAuthColors.occupancyLow : .white.opacity(0.65))
                    Spacer()
                    Text(snapshot.timestamp.formatted(date: .omitted, time: .standard))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.white.opacity(0.5))
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
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(Color.white.opacity(0.11), lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
            }
            .task {
                autoPark.refreshLiveSnapshot()
            }
        }
    }

    private func diagnosticGauge(title: String, value: String, normalized: Double) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Gauge(value: normalized) {
                EmptyView()
            } currentValueLabel: {
                Text(value)
                    .font(.system(size: 15, weight: .bold, design: .monospaced))
                    .foregroundStyle(.white)
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
                .foregroundStyle(.white.opacity(0.46))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 10)
        .background(Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func diagnosticsStatusLight(title: String, isOn: Bool, onColor: Color) -> some View {
        HStack(spacing: 7) {
            Circle()
                .fill(isOn ? onColor : Color.white.opacity(0.22))
                .frame(width: 8, height: 8)
                .shadow(color: isOn ? onColor.opacity(0.45) : .clear, radius: 6)
            Text(title.uppercased())
                .font(.caption2.weight(.semibold))
                .kerning(0.6)
                .foregroundStyle(.white.opacity(0.6))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
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
                        .foregroundStyle(.white)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption.bold())
                        .foregroundStyle(.white.opacity(0.45))
                }
                .padding(.vertical, 4)
            }
            .buttonStyle(.plain)
            .disabled(session.activeSession == nil)
            .opacity(session.activeSession == nil ? 0.45 : 1)
        }
    }

    private var legalSection: some View {
        profileCard(title: "Legal & Support", subtitle: "Privacy, terms, and app version.") {
            VStack(spacing: 0) {
                legalLink(label: "Privacy Policy", systemImage: "hand.raised", url: privacyPolicyURL)
                sectionDivider
                legalLink(label: "Terms of Service", systemImage: "doc.text", url: termsURL)
                sectionDivider
                legalLink(label: "Support", systemImage: "lifepreserver", url: supportURL)
                sectionDivider
                HStack {
                    Text("Version")
                        .foregroundStyle(.white.opacity(0.80))
                    Spacer()
                    Text(Self.versionString)
                        .foregroundStyle(.white.opacity(0.56))
                }
                .font(.subheadline)
                .padding(.vertical, 10)
            }
        }
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
                    .foregroundStyle(.white)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.56))
            }

            content()
        }
        .padding(15)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.white.opacity(0.06))
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(Color.white.opacity(0.10), lineWidth: 1)
                )
        )
    }

    private var sectionDivider: some View {
        Divider().overlay(Color.white.opacity(0.08))
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
                                .foregroundStyle(.white.opacity(0.72))
                        )
                        .frame(width: 36, height: 36)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(lot?.shortName ?? id)
                            .font(.subheadline.bold())
                            .foregroundStyle(.white)
                        Text(lotSubtitle(for: lot))
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.56))
                            .lineLimit(1)
                    }
                    Spacer()
                }
            }
            .buttonStyle(.plain)

            if let lot {
                let capacity = max(lot.totalSpaces, 1)
                let occupancy = webSocket.lotOccupancies[lot.mapId] ?? 0
                let rate = Double(occupancy) / Double(capacity) * 100
                OccupancyPill(rate: min(rate, 100))
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
                    .foregroundStyle(.white.opacity(0.84))
                Spacer()
                Image(systemName: "arrow.up.right")
                    .font(.caption.bold())
                    .foregroundStyle(.white.opacity(0.45))
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
        .foregroundStyle(.white.opacity(0.92))
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

    private func formatDouble(_ value: Double?, digits: Int = 1, suffix: String = "") -> String {
        guard let value else { return "n/a" }
        return String(format: "%.*f%@", digits, value, suffix)
    }

    private func formatSpeedShort(_ value: Double?) -> String {
        guard let value else { return "n/a" }
        if value < 0 { return "n/a" }
        let mph = value * 2.23694
        return String(format: "%.1f mph", mph)
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

    static func prettyPermit(_ raw: String) -> String {
        switch raw {
        case PermitRepository.noPermitAll: return "All lots (no permit)"
        case PermitRepository.noPermitCommuter: return "Commuter lots (no permit)"
        case "None": return "No permit set"
        default: return raw
        }
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
