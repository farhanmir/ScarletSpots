import SwiftUI
import CoreLocation

/// Profile / Settings tab.
///
/// Parity with the RN Profile screen:
/// - Account info + sign-out.
/// - Edit permit / secondary permit.
/// - Favorite lots (resolved to proper lot names, not just IDs).
/// - Campus toggles.
/// - Theme picker.
/// - Diagnostics pane (offline queue depth, auto-park status).
/// - Feedback form (lightweight — only shown when there was a recent session).
struct ProfileView: View {
    @EnvironmentObject private var authManager: AuthManager
    @StateObject private var themePreference = ThemePreference.shared
    @StateObject private var lotRepository = LotRepository.shared
    @StateObject private var offlineQueue = OfflineQueue.shared
    @StateObject private var location = LocationEngine.shared
    @StateObject private var autoPark = AutoParkCoordinator.shared
    @StateObject private var session = NativeSessionStore.shared

    @State private var favorites: [String] = []
    @State private var favoritesLoading = true
    @State private var showFeedback = false
    @State private var showSignOutConfirm = false
    @State private var showDeleteConfirm = false
    @State private var deleteError: String?
    @State private var isDeleting = false

    /// Canonical legal URLs — published copies live on the marketing site.
    private let privacyPolicyURL = URL(string: "https://scarletspots.com/privacy")!
    private let termsURL = URL(string: "https://scarletspots.com/terms")!
    private let supportURL = URL(string: "https://scarletspots.com/support")!

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    heroCard
                    statsStrip
                    mapFiltersSection
                    
                    VStack(spacing: 20) {
                        favoritesSection
                        campusesSection
                        appearanceSection
                        diagnosticsSection
                        feedbackSection
                        legalSection
                        accountActionsSection
                    }
                    .padding(.horizontal, 16)
                }
                .padding(.bottom, 32)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .task {
                favoritesLoading = true
                favorites = (try? await FavoritesAPI.list())
                    ?? OfflineCache.shared.getCachedFavorites()
                favoritesLoading = false
            }
            .refreshable {
                favorites = (try? await FavoritesAPI.list()) ?? favorites
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

    private var heroCard: some View {
        ZStack(alignment: .bottomLeading) {
            // Background Gradient
            LinearGradient(
                colors: [Color(hex: 0xCC0033), Color(hex: 0x80001A)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .frame(height: 200)
            
            VStack(alignment: .leading, spacing: 4) {
                if let user = authManager.currentUser {
                    Text([user.firstName, user.lastName].compactMap { $0 }.joined(separator: " "))
                        .font(.title.bold())
                        .foregroundStyle(.white)
                    
                    Text(user.email)
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.8))
                }
                
                HStack(spacing: 12) {
                    NavigationLink {
                        PermitOnboardingView(fromProfile: true)
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "creditcard.fill")
                            Text(Self.prettyPermit(authManager.permitType ?? "None"))
                        }
                        .font(.caption.bold())
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(.white.opacity(0.2), in: Capsule())
                        .foregroundStyle(.white)
                    }
                    
                    if let secondary = authManager.secondaryPermitType {
                        HStack(spacing: 6) {
                            Image(systemName: "plus.circle.fill")
                            Text(secondary)
                        }
                        .font(.caption.bold())
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(.white.opacity(0.2), in: Capsule())
                        .foregroundStyle(.white)
                    }
                }
                .padding(.top, 8)
            }
            .padding(20)
        }
    }

    private var statsStrip: some View {
        HStack(spacing: 0) {
            statItem(label: "Favorites", value: "\(favorites.count)", systemImage: "star.fill", color: .yellow)
            divider
            statItem(label: "Friends", value: "—", systemImage: "person.2.fill", color: .blue)
            divider
            statItem(label: "Parked", value: "—", systemImage: "parkingsign.circle.fill", color: .green)
        }
        .padding(.vertical, 16)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 16)
    }

    private func statItem(label: String, value: String, systemImage: String, color: Color) -> some View {
        VStack(spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: systemImage)
                    .font(.caption2)
                    .foregroundStyle(color)
                Text(value)
                    .font(.headline.bold())
            }
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    private var divider: some View {
        Divider()
            .frame(height: 24)
            .padding(.horizontal, 8)
    }

    private var mapFiltersSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Map Filters")
                .font(.headline)
                .padding(.leading, 4)
            
            HStack {
                Label("Visibility Mode", systemImage: "line.3.horizontal.decrease.circle")
                    .font(.body)
                Spacer()
                Menu {
                    Button { authManager.setNoPermitMode(nil) } label: {
                        Label("My Permit", systemImage: authManager.noPermitMode == nil ? "checkmark" : "")
                    }
                    Divider()
                    Button { authManager.setNoPermitMode("all") } label: {
                        Label("Show All", systemImage: authManager.noPermitMode == "all" ? "checkmark" : "")
                    }
                    Button { authManager.setNoPermitMode("commuter_all") } label: {
                        Label("Commuter (All)", systemImage: authManager.noPermitMode == "commuter_all" ? "checkmark" : "")
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(authManager.noPermitMode == nil ? "My Permit" : (authManager.noPermitMode == "all" ? "Show All" : "Commuter"))
                        Image(systemName: "chevron.up.chevron.down")
                            .font(.caption2)
                    }
                    .font(.subheadline.bold())
                    .foregroundStyle(.blue)
                }
            }
            .padding()
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        }
        .padding(.horizontal, 16)
    }

    private var favoritesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Favorites")
                .font(.headline)
                .padding(.leading, 4)
            
            VStack(spacing: 0) {
                if favoritesLoading {
                    ForEach(0..<2, id: \.self) { _ in
                        favoriteRowPlaceholder
                    }
                } else if favorites.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "star")
                            .font(.largeTitle)
                            .foregroundStyle(.tertiary)
                        Text("No favorite lots")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 32)
                } else {
                    ForEach(favorites, id: \.self) { id in
                        favoriteRow(id: id)
                        if id != favorites.last {
                            Divider().padding(.leading, 16)
                        }
                    }
                }
            }
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        }
    }

    @ViewBuilder
    private var favoriteRowPlaceholder: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Loading lot")
            Text("Loading full name")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()
        .redacted(reason: .placeholder)
    }

    @ViewBuilder
    private func favoriteRow(id: String) -> some View {
        let lot = lotRepository.byId(id)
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(lot?.shortName ?? id)
                    .font(.body.bold())
                if let name = lot?.propertyName {
                    Text(name)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer()
            Button {
                Task {
                    try? await FavoritesAPI.remove(lotId: id)
                    favorites.removeAll { $0 == id }
                    OfflineCache.shared.cacheFavorites(favorites)
                }
            } label: {
                Image(systemName: "star.fill")
                    .foregroundStyle(.yellow)
            }
            .buttonStyle(.plain)
        }
        .padding()
    }

    private var campusesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Campuses")
                .font(.headline)
                .padding(.leading, 4)
            
            VStack(spacing: 0) {
                campusToggle("Busch")
                Divider().padding(.leading, 16)
                campusToggle("College Ave")
                Divider().padding(.leading, 16)
                campusToggle("Livingston")
                Divider().padding(.leading, 16)
                campusToggle("Cook/Douglass")
            }
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        }
    }

    private var appearanceSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Appearance")
                .font(.headline)
                .padding(.leading, 4)
            
            HStack {
                Text("Theme")
                Spacer()
                Picker("Theme", selection: $themePreference.mode) {
                    Text("System").tag("system")
                    Text("Light").tag("light")
                    Text("Dark").tag("dark")
                }
                .pickerStyle(.menu)
            }
            .padding()
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        }
    }

    private var diagnosticsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Diagnostics")
                .font(.headline)
                .padding(.leading, 4)
            
            VStack(spacing: 0) {
                diagnosticRow(label: "Location", value: authorizationLabel(location.authorization))
                Divider().padding(.leading, 16)
                diagnosticRow(label: "Auto-Park", value: autoPark.isRunning ? "Running" : "Idle")
                Divider().padding(.leading, 16)
                diagnosticRow(label: "Pending Sync", value: "\(offlineQueue.pendingCount)")
                if let last = autoPark.lastAutoCommitAt {
                    Divider().padding(.leading, 16)
                    diagnosticRow(label: "Last Auto-Park", value: last.formatted(date: .abbreviated, time: .shortened))
                }
            }
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        }
    }

    private func diagnosticRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text(value)
                .foregroundStyle(.secondary)
        }
        .padding()
    }

    private var feedbackSection: some View {
        Button { showFeedback = true } label: {
            HStack {
                Text("Send Feedback")
                    .foregroundStyle(.primary)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .padding()
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        }
        .disabled(session.activeSession == nil)
    }

    private var legalSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Legal & Support")
                .font(.headline)
                .padding(.leading, 4)
            
            VStack(spacing: 0) {
                legalLink(label: "Privacy Policy", systemImage: "hand.raised", url: privacyPolicyURL)
                Divider().padding(.leading, 16)
                legalLink(label: "Terms of Service", systemImage: "doc.text", url: termsURL)
                Divider().padding(.leading, 16)
                legalLink(label: "Support", systemImage: "lifepreserver", url: supportURL)
                Divider().padding(.leading, 16)
                HStack {
                    Text("Version")
                    Spacer()
                    Text(Self.versionString)
                        .foregroundStyle(.secondary)
                }
                .padding()
            }
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        }
    }

    private func legalLink(label: String, systemImage: String, url: URL) -> some View {
        Link(destination: url) {
            HStack {
                Label(label, systemImage: systemImage)
                    .foregroundStyle(.primary)
                Spacer()
                Image(systemName: "arrow.up.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .padding()
        }
    }

    private var accountActionsSection: some View {
        VStack(spacing: 12) {
            Button { showSignOutConfirm = true } label: {
                Text("Sign Out")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.red, in: RoundedRectangle(cornerRadius: 12))
            }
            
            Button(role: .destructive) { showDeleteConfirm = true } label: {
                Text("Delete Account")
                    .font(.subheadline)
                    .foregroundStyle(.red)
                    .padding(.vertical, 8)
            }
        }
        .padding(.top, 12)
    }

    // MARK: - Actions

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
        .accessibilityHint("Show or hide \(campus) lots on the map.")
    }

    private func authorizationLabel(_ status: CLAuthorizationStatus) -> String {
        switch status {
        case .authorizedAlways: return "Always"
        case .authorizedWhenInUse: return "While Using"
        case .denied: return "Denied"
        case .restricted: return "Restricted"
        case .notDetermined: return "Not Set"
        @unknown default: return "Unknown"
        }
    }

    static func prettyPermit(_ raw: String) -> String {
        switch raw {
        case PermitRepository.noPermitAll: return "All lots (no permit)"
        case PermitRepository.noPermitCommuter: return "Commuter lots (no permit)"
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
                            try? await ParkAPI.sendFeedback(
                                sessionId: session.id,
                                rating: rating,
                                notes: notes.isEmpty ? nil : notes
                            )
                            dismiss()
                        }
                    }
                    .disabled(isSending)
                }
            }
        }
    }
}
