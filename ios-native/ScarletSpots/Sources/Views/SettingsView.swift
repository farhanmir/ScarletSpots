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
            Form {
                profileSection
                favoritesSection
                campusesSection
                appearanceSection
                diagnosticsSection
                feedbackSection
                legalSection
                accountActionsSection
            }
            .navigationTitle("Profile")
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

    private var profileSection: some View {
        Section("Account") {
            if let user = authManager.currentUser {
                LabeledContent("Name", value: [user.firstName, user.lastName].compactMap { $0 }.joined(separator: " "))
                LabeledContent("Email", value: user.email)
            }
            NavigationLink("Update Permit") {
                PermitOnboardingView(fromProfile: true)
            }
            if let permit = authManager.permitType {
                LabeledContent("Permit", value: Self.prettyPermit(permit))
            }
            if let secondary = authManager.secondaryPermitType {
                LabeledContent("Secondary", value: secondary)
            }
        }
    }

    private var favoritesSection: some View {
        Section("Favorites") {
            if favoritesLoading {
                ForEach(0..<2, id: \.self) { _ in
                    VStack(alignment: .leading) {
                        Text("Loading lot")
                        Text("Loading full name")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .redacted(reason: .placeholder)
                }
            } else if favorites.isEmpty {
                ContentUnavailableView(
                    "No favorite lots",
                    systemImage: "star",
                    description: Text("Tap the star on a lot's details sheet to pin it here.")
                )
                .frame(maxWidth: .infinity)
            } else {
                ForEach(favorites, id: \.self) { id in
                    let lot = lotRepository.byId(id)
                    HStack {
                        VStack(alignment: .leading) {
                            Text(lot?.shortName ?? id)
                                .textSelection(.enabled)
                            if let name = lot?.propertyName {
                                Text(name)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .textSelection(.enabled)
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
                            Image(systemName: "trash")
                                .foregroundStyle(.red)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Remove \(lot?.shortName ?? id) from favorites")
                    }
                }
            }
        }
    }

    private var campusesSection: some View {
        Section("Campuses") {
            campusToggle("Busch")
            campusToggle("College Ave")
            campusToggle("Livingston")
            campusToggle("Cook/Douglass")
        }
    }

    private var appearanceSection: some View {
        Section("Appearance") {
            Picker("Theme", selection: $themePreference.mode) {
                Text("System").tag("system")
                Text("Light").tag("light")
                Text("Dark").tag("dark")
            }
        }
    }

    private var diagnosticsSection: some View {
        Section("Diagnostics") {
            LabeledContent("Location", value: authorizationLabel(location.authorization))
            LabeledContent("Auto-Park", value: autoPark.isRunning ? "Running" : "Idle")
            LabeledContent("Pending Sync", value: "\(offlineQueue.pendingCount)")
            if let last = autoPark.lastAutoCommitAt {
                LabeledContent("Last Auto-Park", value: last.formatted(date: .abbreviated, time: .shortened))
            }
        }
    }

    private var feedbackSection: some View {
        Section {
            Button("Send feedback") { showFeedback = true }
                .disabled(session.activeSession == nil)
        } footer: {
            Text(session.activeSession == nil
                 ? "Start a parking session to leave feedback."
                 : "Tell us how this session went.")
        }
    }

    private var legalSection: some View {
        Section("Legal & Support") {
            Link(destination: privacyPolicyURL) {
                Label("Privacy Policy", systemImage: "hand.raised")
            }
            .accessibilityLabel("Open privacy policy in browser")

            Link(destination: termsURL) {
                Label("Terms of Service", systemImage: "doc.text")
            }
            .accessibilityLabel("Open terms of service in browser")

            Link(destination: supportURL) {
                Label("Support", systemImage: "lifepreserver")
            }
            .accessibilityLabel("Open support site in browser")

            LabeledContent("Version", value: Self.versionString)
                .textSelection(.enabled)
        }
    }

    private var accountActionsSection: some View {
        Section {
            Button("Sign Out", role: .destructive) {
                showSignOutConfirm = true
            }
            Button(role: .destructive) {
                showDeleteConfirm = true
            } label: {
                if isDeleting {
                    HStack {
                        ProgressView().scaleEffect(0.8)
                        Text("Deleting…")
                    }
                } else {
                    Text("Delete Account")
                }
            }
            .disabled(isDeleting)
        } footer: {
            Text("Deleting your account permanently removes all of your data from ScarletSpots. Required by Apple's account-deletion policy.")
        }
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
