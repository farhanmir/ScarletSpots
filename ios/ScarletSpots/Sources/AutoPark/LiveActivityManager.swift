import Foundation
import ActivityKit

/// Thin wrapper around ActivityKit for the parking Live Activity.
///
/// Only one activity is live at a time; starting a new activity while one
/// is active will end the previous one first so we never leak orphans in
/// the Lock Screen / Dynamic Island.
@available(iOS 16.2, *)
@MainActor
final class LiveActivityManager {
    static let shared = LiveActivityManager()

    private var currentActivity: Activity<ParkingAttributes>?

    private init() {}

    var isActivitySupported: Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    func startParkingActivity(
        lotId: String,
        lotName: String,
        distance: String = "—",
        deckLevelSubtitle: String? = nil
    ) {
        guard isActivitySupported else {
            Logger.log("Live activities disabled by user or unsupported device")
            return
        }

        if let currentActivity, currentActivity.attributes.lotId == lotId {
            let subtitle = deckLevelSubtitle ?? currentActivity.content.state.deckLevelSubtitle
            updateActivity(
                lotName: lotName,
                distance: distance,
                startedAt: currentActivity.content.state.startedAt,
                deckLevelSubtitle: subtitle
            )
            return
        }

        if let existing = Activity<ParkingAttributes>.activities.first(where: { $0.attributes.lotId == lotId }) {
            currentActivity = existing
            let subtitle = deckLevelSubtitle ?? existing.content.state.deckLevelSubtitle
            updateActivity(
                lotName: lotName,
                distance: distance,
                startedAt: existing.content.state.startedAt,
                deckLevelSubtitle: subtitle
            )
            return
        }

        Task {
            for activity in Activity<ParkingAttributes>.activities where activity.attributes.lotId != lotId {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }

        let attributes = ParkingAttributes(lotId: lotId)
        let state = ParkingAttributes.ContentState(
            lotName: lotName,
            distance: distance,
            startedAt: Date(),
            deckLevelSubtitle: deckLevelSubtitle
        )
        do {
            currentActivity = try Activity.request(
                attributes: attributes,
                content: .init(state: state, staleDate: nil)
            )
        } catch {
            Logger.log("Live activity start failed: \(error.localizedDescription)")
        }
    }

    func updateActivity(distance: String) {
        guard let currentActivity else { return }
        updateActivity(
            lotName: currentActivity.content.state.lotName,
            distance: distance,
            startedAt: currentActivity.content.state.startedAt,
            deckLevelSubtitle: currentActivity.content.state.deckLevelSubtitle
        )
    }

    func updateActivity(lotName: String, distance: String, startedAt: Date, deckLevelSubtitle: String?) {
        guard let currentActivity else { return }
        let state = ParkingAttributes.ContentState(
            lotName: lotName,
            distance: distance,
            startedAt: startedAt,
            deckLevelSubtitle: deckLevelSubtitle
        )
        Task { await currentActivity.update(.init(state: state, staleDate: nil)) }
    }

    func stopActivity() {
        let existing = currentActivity
        currentActivity = nil
        Task {
            if let existing {
                await existing.end(nil, dismissalPolicy: .immediate)
            }
            for activity in Activity<ParkingAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }
}
