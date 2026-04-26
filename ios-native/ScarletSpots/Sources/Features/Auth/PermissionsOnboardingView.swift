import SwiftUI
import CoreLocation
import CoreMotion
import CoreLocationUI
import UserNotifications

/// Four-step permissions flow shown after account creation (and before the
/// permit picker).
///
/// Step order matches iOS affordances:
/// 1. Location — When In Use. Required for the map to center on the user.
/// 2. Location — Always. Required for auto-park to see the signal that the
///    user stopped in a lot without opening the app.
/// 3. Motion & Fitness. Feeds the motion classifier that detects the
///    driving → walking transition.
/// 4. Notifications + APNS registration. Needed for Live Activities and for
///    friend notifications.
///
/// The user can skip any step; the app degrades gracefully (auto-park is
/// off without Always, etc.).
struct PermissionsOnboardingView: View {
    let onFinished: () -> Void

    @StateObject private var location = LocationEngine.shared
    @StateObject private var motion = MotionEngine.shared
    @State private var step: Step = .foreground
    @State private var notifStatus: UNAuthorizationStatusWrapper = .unknown
    @State private var motionStatusTick = 0

    private enum Step: Int, CaseIterable {
        case foreground, background, motion, push
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
            skipButton
        }
        .padding(.vertical, 20)
        .task { await refreshNotifStatus() }
        .onChange(of: location.authorization) { _, _ in advanceIfReady() }
        .onChange(of: motionStatusTick) { _, _ in advanceIfReady() }
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
            Text("Step \(step.rawValue + 1) of 4")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var stepIcon: String {
        switch step {
        case .foreground: return "location"
        case .background: return "location.fill.viewfinder"
        case .motion: return "figure.walk.motion"
        case .push: return "bell.badge"
        }
    }

    private var stepTitle: String {
        switch step {
        case .foreground: return "Find lots near you"
        case .background: return "Auto-detect parking"
        case .motion: return "Motion & fitness"
        case .push: return "Stay in the loop"
        }
    }

    private var detailText: String {
        switch step {
        case .foreground:
            return "ScarletSpots uses your location while you're in the app to center the map and show the closest open lots. We never share it."
        case .background:
            return "\"Always Allow\" lets us detect when you've parked without you opening the app. You can turn this off any time in Settings."
        case .motion:
            return "Motion & Fitness tells us when you transition from driving to walking — the clearest signal that you just parked."
        case .push:
            return "Notifications power Live Activities (your session on the Lock Screen) and friend updates."
        }
    }

    @ViewBuilder
    private var primaryButton: some View {
        if step == .foreground && !location.hasForegroundPermission {
            LocationButton(.shareCurrentLocation) {
                location.requestForegroundPermission()
            }
            .labelStyle(.titleOnly)
            .font(.headline)
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .tint(.red)
            .cornerRadius(12)
            .padding(.horizontal, 20)
        } else {
            Button(action: primaryAction) {
                Text(primaryButtonTitle)
                    .font(.headline)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.red)
            .padding(.horizontal, 20)
        }
    }

    @ViewBuilder
    private var skipButton: some View {
        Button {
            advance()
        } label: {
            Text("Skip for now")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private var primaryButtonTitle: String {
        switch step {
        case .foreground: return location.hasForegroundPermission ? "Next" : "Allow Location"
        case .background: return location.hasBackgroundPermission ? "Next" : "Allow Always"
        case .motion:
            switch motion.authorizationStatus {
            case .authorized: return "Next"
            case .denied, .restricted: return "Next"
            default: return "Enable Motion"
            }
        case .push: return notifStatus == .authorized ? "Finish" : "Enable Notifications"
        }
    }

    private func primaryAction() {
        switch step {
        case .foreground:
            if location.hasForegroundPermission { advance() }
            else { location.requestForegroundPermission() }
        case .background:
            if location.hasBackgroundPermission { advance() }
            else { location.requestAlwaysPermission() }
        case .motion:
            // Kicking off motion updates triggers the iOS prompt. We bump a
            // tick so the UI refreshes when the prompt result lands.
            motion.start()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                motionStatusTick += 1
                advance()
            }
        case .push:
            Task {
                _ = await PushRegistration.shared.requestAuthorization()
                await refreshNotifStatus()
                onFinished()
            }
        }
    }

    private func advanceIfReady() {
        switch step {
        case .foreground where location.hasForegroundPermission: advance()
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
}

private enum UNAuthorizationStatusWrapper {
    case unknown, notDetermined, authorized, denied
}
