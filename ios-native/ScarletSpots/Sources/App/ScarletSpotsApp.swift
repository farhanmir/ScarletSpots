import SwiftUI

@main
struct ScarletSpotsApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var authManager = AuthManager.shared
    @AppStorage(ThemePreference.key) private var themeMode = "system"

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(authManager)
                .preferredColorScheme(ThemePreference.colorScheme(for: themeMode))
                .task {
                    OfflineQueue.shared.start()
                    await PushRegistration.shared.bootstrap()
                }
        }
    }
}
