import SwiftUI
import CoreLocation

struct RootView: View {
    @EnvironmentObject private var auth: AuthManager
    @StateObject private var locationEngine = LocationEngine.shared
    @State private var didBoot = false
    @State private var bootTimeoutElapsed = false

    var body: some View {
        Group {
            if !Env.isConfigurationValid {
                NativeConfigErrorView(issues: Env.configurationIssues)
            } else if !auth.isAuthenticated {
                AuthChoiceView()
            } else if !hasForegroundLocation {
                PermissionsOnboardingView(onFinished: {})
            } else if auth.currentUser == nil && !bootTimeoutElapsed {
                bootLoadingView
            } else if auth.permitType == nil {
                PermitOnboardingView(fromProfile: false)
            } else {
                MainTabView()
            }
        }
        .onChange(of: auth.isAuthenticated) { _, isAuthed in
            Task { await AutoParkCoordinator.shared.handleEligibilityChange(wakeReason: isAuthed ? "auth_signed_in" : "auth_signed_out") }
        }
        .onChange(of: locationEngine.authorization) { _, _ in
            Task { await AutoParkCoordinator.shared.handleEligibilityChange(wakeReason: "permission_changed") }
        }
        .onChange(of: auth.isAuthenticated) { _, isAuthed in
            if !isAuthed { bootTimeoutElapsed = false }
        }
        .onChange(of: auth.currentUser?.id) { _, userId in
            if userId != nil { bootTimeoutElapsed = false }
        }
        .task {
            if !didBoot {
                didBoot = true
                AutoParkCoordinator.shared.noteManualOpen()
                await AutoParkCoordinator.shared.handleEligibilityChange(wakeReason: "manual_open")
            }
        }
        .task(id: auth.isAuthenticated) {
            guard auth.isAuthenticated else { return }
            guard auth.currentUser == nil else { return }
            bootTimeoutElapsed = false
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            if auth.isAuthenticated && auth.currentUser == nil {
                bootTimeoutElapsed = true
            }
        }
    }

    private var hasForegroundLocation: Bool {
        locationEngine.hasForegroundPermission
    }

    /// Avoid flashing onboarding/permit routes while the user profile is still
    /// being hydrated after auth restore.
    private var bootLoadingView: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            ProgressView("Loading ScarletSpots...")
                .tint(.white)
                .foregroundStyle(.white.opacity(0.82))
        }
    }
}

private struct NativeConfigErrorView: View {
    let issues: [String]
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ZStack {
            backgroundGradient
                .ignoresSafeArea()

            // Warm accent behind the icon so the top half of the screen
            // isn't a pure-black void on OLED displays.
            RadialGradient(
                colors: isDark
                    ? [Color(red: 0.55, green: 0.08, blue: 0.08).opacity(0.55), .clear]
                    : [Color(red: 1, green: 0.85, blue: 0.85).opacity(0.9), .clear],
                center: .init(x: 0.5, y: 0.28),
                startRadius: 10,
                endRadius: 360
            )
            .ignoresSafeArea()
            .allowsHitTesting(false)

            ScrollView {
                VStack(spacing: 18) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 56, weight: .semibold))
                        .foregroundStyle(Color(red: 0.86, green: 0.15, blue: 0.15))
                        .padding(.top, 8)

                    Text("Configuration Missing")
                        .font(.title.bold())
                        .multilineTextAlignment(.center)

                    Text("This build is missing the native iOS API/Supabase settings, so sign in cannot reach the right host.")
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)

                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(issues, id: \.self) { issue in
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(Color(red: 0.86, green: 0.15, blue: 0.15).opacity(0.85))
                                Text(issue)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .font(.footnote)
                        }
                    }
                    .foregroundStyle(.primary.opacity(0.85))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))

                    Text("Fix: set `IOS_API_BASE_URL`, `IOS_SUPABASE_URL` (repo Variables) and `IOS_SUPABASE_ANON_KEY` (repo Secret), then re-run the iOS Native Build workflow.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 4)
                }
                .padding(.horizontal, 28)
                .padding(.top, 40)
                .padding(.bottom, 32)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
    }

    private var backgroundGradient: LinearGradient {
        LinearGradient(
            colors: isDark
                ? [Color(red: 0.32, green: 0.06, blue: 0.06), Color(red: 0.12, green: 0.04, blue: 0.05), .black]
                : [Color(red: 1, green: 0.96, blue: 0.96), Color(red: 1, green: 0.98, blue: 0.98), .white],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    private var isDark: Bool { colorScheme != .light }
}
