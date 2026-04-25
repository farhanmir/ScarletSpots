import SwiftUI

@main
struct ScarletSpotsApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var authManager = AuthManager.shared
    @StateObject private var themePreference = ThemePreference.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(authManager)
                .environmentObject(themePreference)
                .preferredColorScheme(themePreference.colorScheme)
                .task {
                    OfflineQueue.shared.start()
                    await PushRegistration.shared.bootstrap()
                }
        }
    }
}
