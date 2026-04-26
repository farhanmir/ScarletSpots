import UIKit
import UserNotifications

/// UIApplicationDelegate shim owned by SwiftUI's `UIApplicationDelegateAdaptor`.
///
/// We need a real `UIApplicationDelegate` to:
/// - receive the APNS device token via
///   `application(_:didRegisterForRemoteNotificationsWithDeviceToken:)`,
/// - log APNS registration failures, and
/// - route incoming notifications even when the app is in the background.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        let launchReason = launchOptions?[.location] != nil ? "location_launch" : "cold_launch"
        Task { @MainActor in
            OfflineQueue.shared.start()
            await PushRegistration.shared.bootstrap()
            await AutoParkCoordinator.shared.bootstrap(launchReason: launchReason)
        }
        return true
    }

    // MARK: - APNS token

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        PushRegistration.handleTokenUpdate(hex)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        Logger.log("APNS registration failed: \(error.localizedDescription)")
    }

    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        Task { @MainActor in
            let type = userInfo["type"] as? String ?? "silent_push"
            await NativeSessionStore.shared.bootstrapRefresh()
            await AutoParkCoordinator.shared.handleEligibilityChange(wakeReason: "silent_push_\(type)")
            completionHandler(.newData)
        }
    }

    // MARK: - UNUserNotificationCenterDelegate

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .list, .sound, .badge])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        completionHandler()
    }
}
