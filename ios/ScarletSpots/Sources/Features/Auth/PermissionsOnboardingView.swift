import SwiftUI
import CoreLocation
import CoreMotion
import UserNotifications
import UIKit

/// Five-step permissions flow shown after account creation (and before the
/// permit picker).
///
/// Step order matches iOS affordances:
/// 1. Location — When In Use. Required for the map to center on the user.
/// 2. Location — Precise. Required for reliable lot detection.
/// 3. Location — Always. Required for auto-park to see the signal that the
///    user stopped in a lot without opening the app.
/// 4. Motion & Fitness. Feeds the motion classifier that detects the
///    driving → walking transition.
/// 5. Notifications + APNS registration. Needed for Live Activities and for
///    friend notifications.
///
/// After people review the guided flow once, the app can continue even if
/// some optional permissions stay off. Features degrade gracefully (auto-park
/// is off without Always, etc.).
struct PermissionsOnboardingView: View {
    let onFinished: () -> Void

    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var location = LocationEngine.shared
    @StateObject private var motion = MotionEngine.shared
    @State private var step: Step = .foreground
    @State private var notifStatus: UNAuthorizationStatusWrapper = .unknown
    @State private var motionStatusTick = 0
    @State private var hasRequestedAlways = false

    private enum Step: Int, CaseIterable {
        case foreground, precise, background, motion, push
    }

    var body: some View {
        VStack(spacing: 20) {
            progressHeader

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    stepHeader
                    Text(detailText)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            primaryButton
        }
        .padding(.vertical, 20)
        .task { await refreshNotifStatus() }
        .onChange(of: location.authorization) { _, _ in advanceIfReady() }
        .onChange(of: location.accuracyAuthorization) { _, _ in advanceIfReady() }
        .onChange(of: motionStatusTick) { _, _ in advanceIfReady() }
        .onChange(of: scenePhase) { _, newPhase in
            guard newPhase == .active else { return }
            motionStatusTick += 1
            Task { await refreshNotifStatus() }
        }
    }

    // MARK: - Derived copy

    private var stepHeader: some View {
        HStack(alignment: .firstTextBaseline) {
            Image(systemName: stepIcon)
                .font(.title)
                .foregroundStyle(.red)
            Text(stepTitle)
                .font(.title2.bold())
        }
    }

    private var progressHeader: some View {
        VStack(spacing: 10) {
            ProgressView(value: Double(step.rawValue + 1), total: Double(Step.allCases.count))
                .tint(.red)
                .padding(.horizontal, 20)
            Text("Step \(step.rawValue + 1) of 5")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var stepIcon: String {
        switch step {
        case .foreground: return "location"
        case .precise: return "location.north.circle"
        case .background: return "location.fill.viewfinder"
        case .motion: return "figure.walk.motion"
        case .push: return "bell.badge"
        }
    }

    private var stepTitle: String {
        switch step {
        case .foreground: return "Find lots near you"
        case .precise: return "Use precise location"
        case .background: return "Auto-detect parking"
        case .motion: return "Motion & fitness"
        case .push: return "Stay in the loop"
        }
    }

    private var detailText: String {
        switch step {
        case .foreground:
            return "ScarletSpots uses your location while you're in the app to center the map and show the closest open lots. We never share it."
        case .precise:
            return "Turn on Precise Location in iOS so we can tell which lot you're actually in. Reduced accuracy makes auto-park and walk-back guidance much less reliable."
        case .background:
            return "\"Always Allow\" lets us detect when you've parked without you opening the app. You can turn this off any time in Settings."
        case .motion:
            return "Motion & Fitness tells us when you transition from driving to walking — the clearest signal that you just parked."
        case .push:
            return "Notifications power Live Activities (your session on the Lock Screen) and friend updates."
        }
    }

    private var supportText: String? {
        switch step {
        case .foreground:
            switch location.authorization {
            case .denied, .restricted:
                return "You can continue without this, but the map cannot center on you until location access is turned on in Settings."
            default:
                return nil
            }
        case .precise:
            return location.accuracyAuthorization == .fullAccuracy
                ? nil
                : "You can continue without Precise Location, but lot-level detection will be less accurate."
        case .background:
            return hasRequestedAlways && !location.hasBackgroundPermission
                ? "You can continue without Always Allow, but auto-start and auto-end will not run reliably in the background."
                : nil
        case .motion:
            switch motion.authorizationStatus {
            case .denied, .restricted:
                return "You can continue without Motion & Fitness, but the driving-to-walking signal will be unavailable."
            default:
                return nil
            }
        case .push:
            return notifStatus == .denied
                ? "You can continue without notifications, but you will miss friend alerts, permit reminders, and auto-park confirmations."
                : nil
        }
    }

    @ViewBuilder
    private var primaryButton: some View {
        Button(action: primaryAction) {
            VStack(spacing: 4) {
                Text(primaryButtonTitle)
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                if let supportText {
                    Text(supportText)
                        .font(.caption)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.white.opacity(0.85))
                }
            }
        }
        .buttonStyle(.borderedProminent)
        .tint(.red)
        .padding(.horizontal, 20)
    }

    private var primaryButtonTitle: String {
        switch step {
        case .foreground:
            switch location.authorization {
            case .denied, .restricted: return "Continue"
            default: return location.hasForegroundPermission ? "Next" : "Continue"
            }
        case .precise:
            return location.accuracyAuthorization == .fullAccuracy ? "Next" : "Open Settings"
        case .background:
            return location.hasBackgroundPermission ? "Next" : "Continue"
        case .motion:
            switch motion.authorizationStatus {
            case .authorized: return "Next"
            case .denied, .restricted: return "Continue"
            default: return "Continue"
            }
        case .push:
            switch notifStatus {
            case .authorized: return "Finish"
            case .denied: return "Finish"
            default: return "Continue"
            }
        }
    }

    private func primaryAction() {
        switch step {
        case .foreground:
            if location.hasForegroundPermission { advance() }
            else if location.authorization == .denied || location.authorization == .restricted {
                advance()
            } else {
                location.requestForegroundPermission()
            }
        case .precise:
            if location.accuracyAuthorization == .fullAccuracy { advance() }
            else { openSettings() }
        case .background:
            if location.hasBackgroundPermission { advance() }
            else if hasRequestedAlways {
                advance()
            } else {
                hasRequestedAlways = true
                location.requestAlwaysPermission()
            }
        case .motion:
            switch motion.authorizationStatus {
            case .authorized:
                advance()
            case .denied, .restricted:
                advance()
            default:
                // Kicking off motion updates triggers the iOS prompt. We bump a
                // tick so the UI refreshes when the prompt result lands.
                motion.start()
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                    motionStatusTick += 1
                    advance()
                }
            }
        case .push:
            Task {
                if notifStatus == .denied {
                    await refreshNotifStatus()
                } else {
                    _ = await PushRegistration.shared.requestAuthorization()
                    await refreshNotifStatus()
                }
                onFinished()
            }
        }
    }

    private func advanceIfReady() {
        switch step {
        case .foreground where location.hasForegroundPermission: advance()
        case .precise where location.accuracyAuthorization == .fullAccuracy: advance()
        case .background where location.hasBackgroundPermission: advance()
        case .motion where motion.authorizationStatus == .authorized: advance()
        default: break
        }
    }

    private func advance() {
        if step == .push {
            onFinished()
            return
        }
        if let next = Step(rawValue: step.rawValue + 1) {
            step = next
        } else {
            onFinished()
        }
    }

    @MainActor
    private func refreshNotifStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            notifStatus = .authorized
        case .denied:
            notifStatus = .denied
        case .notDetermined:
            notifStatus = .notDetermined
        @unknown default:
            notifStatus = .unknown
        }
    }

    private func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }
}

private enum UNAuthorizationStatusWrapper {
    case unknown, notDetermined, authorized, denied
}
