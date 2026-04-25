import Foundation
import UserNotifications
import UIKit

/// Handles APNS authorization + device-token lifecycle.
///
/// Flow:
/// 1. On launch (and after sign-in) we call `bootstrap()` which asks for
///    permission if undetermined and immediately registers with APNS when
///    authorized. This kicks off a `didRegisterForRemoteNotificationsWithDeviceToken`
///    callback in `AppDelegate` that funnels into `handleTokenUpdate(_:)`.
/// 2. `handleTokenUpdate` persists the token locally, syncs it to the backend
///    (once per change), and retries via the offline queue if the network is
///    down.
/// 3. On sign-out we stash the token so we can delete it from the server
///    later, then clear local state.
final class PushRegistration {
    static let shared = PushRegistration()

    private let storedTokenKey = "ss.push.apnsToken"
    private let syncedOwnerKey = "ss.push.syncedOwner"

    private init() {}

    // MARK: - Lifecycle

    /// Call once at app launch. Will:
    /// - request authorization if still undetermined,
    /// - re-register with APNS so we get a fresh device token,
    /// - and surface the current auth state to the system UI.
    func bootstrap() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()

        switch settings.authorizationStatus {
        case .notDetermined:
            // Defer asking until the onboarding flow — we shouldn't prompt on
            // cold launch without user context. Just skip.
            return
        case .denied:
            return
        case .authorized, .provisional, .ephemeral:
            await MainActor.run { UIApplication.shared.registerForRemoteNotifications() }
        @unknown default:
            break
        }
    }

    /// Called by the permissions onboarding screen. Requests permission and
    /// registers for APNS if granted.
    @discardableResult
    func requestAuthorization() async -> Bool {
        let center = UNUserNotificationCenter.current()
        let granted = (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) ?? false
        if granted {
            await MainActor.run { UIApplication.shared.registerForRemoteNotifications() }
        }
        return granted
    }

    // MARK: - Token handling

    /// Invoked from `AppDelegate` when APNS returns a device token.
    static func handleTokenUpdate(_ hexToken: String) {
        Task { await shared.persistAndSync(hexToken) }
    }

    private func persistAndSync(_ token: String) async {
        let previousToken = UserDefaults.standard.string(forKey: storedTokenKey)
        let previousOwner = UserDefaults.standard.string(forKey: syncedOwnerKey)
        let (currentOwner, isAuthed) = await MainActor.run {
            (AuthManager.shared.ownerId, AuthManager.shared.isAuthenticated)
        }

        UserDefaults.standard.set(token, forKey: storedTokenKey)

        // Skip re-syncing if this token was already registered for this owner.
        if previousToken == token, previousOwner == currentOwner { return }

        // Only sync if the user is signed in — otherwise the backend endpoint
        // will 401 and we have nothing useful to do with it yet.
        guard isAuthed else { return }

        let payload = try? JSONSerialization.data(withJSONObject: [
            "token": token,
            "platform": "ios"
        ])

        do {
            _ = try await APIClient.shared.rawRequest(
                "users/me/push-token",
                method: "POST",
                body: payload
            )
            UserDefaults.standard.set(currentOwner, forKey: syncedOwnerKey)
        } catch {
            await OfflineQueue.shared.enqueue(
                type: "PUSH_TOKEN",
                endpoint: "users/me/push-token",
                payload: payload,
                idempotencyKey: "push_\(currentOwner)_\(token)"
            )
        }
    }

    /// Call on sign-out: best-effort DELETE of the token, then wipe local
    /// bookkeeping so the next sign-in re-registers.
    func clearOnSignOut() async {
        let token = UserDefaults.standard.string(forKey: storedTokenKey)
        UserDefaults.standard.removeObject(forKey: syncedOwnerKey)
        guard let token else { return }
        let payload = try? JSONSerialization.data(withJSONObject: ["token": token])
        _ = try? await APIClient.shared.rawRequest(
            "users/me/push-token",
            method: "DELETE",
            body: payload
        )
    }
}
