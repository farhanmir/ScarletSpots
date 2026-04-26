import SwiftUI
import CoreLocation

struct RootView: View {
    @EnvironmentObject private var auth: AuthManager
    @StateObject private var locationEngine = LocationEngine.shared
    @State private var didBoot = false

    var body: some View {
        Group {
            if !Env.isConfigurationValid {
                NativeConfigErrorView(issues: Env.configurationIssues)
            } else if !auth.isAuthenticated {
                AuthChoiceView()
            } else if !hasForegroundLocation {
                PermissionsOnboardingView(onFinished: {})
            } else if auth.permitType == nil {
                PermitOnboardingView(fromProfile: false)
            } else {
                MainTabView()
            }
        }
        .onChange(of: auth.isAuthenticated) { _, isAuthed in
            Task { await applyAutoParkGate(isAuthed: isAuthed) }
        }
        .onChange(of: locationEngine.authorization) { _, _ in
            Task { await applyAutoParkGate(isAuthed: auth.isAuthenticated) }
        }
        .task {
            if !didBoot {
                didBoot = true
                await applyAutoParkGate(isAuthed: auth.isAuthenticated)
            }
        }
    }

    private var hasForegroundLocation: Bool {
        locationEngine.hasForegroundPermission
    }

    /// Start AutoPark only when the user is signed in AND has granted
    /// "Always" location. Otherwise we waste battery and get a runtime crash
    /// from `allowsBackgroundLocationUpdates = true` without Always.
    private func applyAutoParkGate(isAuthed: Bool) async {
        if isAuthed, locationEngine.hasBackgroundPermission {
            AutoParkCoordinator.shared.start()
        } else {
            AutoParkCoordinator.shared.stop()
        }
    }
}

private struct NativeConfigErrorView: View {
    let issues: [String]
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ZStack {
            LinearGradient(
                colors: isDark
                    ? [Color(red: 0.27, green: 0.04, blue: 0.04), Color(red: 0.09, green: 0.09, blue: 0.11), .black]
                    : [Color(red: 1, green: 0.96, blue: 0.96), Color(red: 1, green: 0.98, blue: 0.98), .white],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 18) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 56, weight: .semibold))
                    .foregroundStyle(Color(red: 0.86, green: 0.15, blue: 0.15))

                Text("Configuration Missing")
                    .font(.title.bold())
                    .multilineTextAlignment(.center)

                Text("This IPA is missing the native iOS API/Supabase settings, so sign in cannot reach the right host.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(3)

                VStack(alignment: .leading, spacing: 8) {
                    ForEach(issues, id: \.self) { issue in
                        Label(issue, systemImage: "xmark.circle.fill")
                            .font(.footnote)
                    }
                }
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .padding(28)
            .frame(maxWidth: 420)
        }
    }

    private var isDark: Bool { colorScheme != .light }
}
