import SwiftUI
import CoreLocation

struct RootView: View {
    @EnvironmentObject private var auth: AuthManager
    @StateObject private var locationEngine = LocationEngine.shared
    @State private var didBoot = false

    var body: some View {
        Group {
            if !auth.isAuthenticated {
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
