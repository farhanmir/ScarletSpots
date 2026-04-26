import Foundation
import SwiftUI

/// Cross-tab coordination state.
///
/// Exposed as an environment object from `MainTabView` so deep-link style
/// interactions (e.g. Search tapping a result to "jump to" the map) can
/// communicate without every feature owning its own router.
@MainActor
final class TabBarState: ObservableObject {
    /// Hides the tab bar behind modals / full-screen flows.
    @Published var isHidden = false

    /// Which tab is currently selected. Default to Map on cold start.
    @Published var selectedTab: Int = 1

    /// When Search wants to navigate the Map to a specific lot, it sets
    /// `focusLotId` after switching to the Map tab. `MapView` consumes &
    /// resets it.
    @Published var focusLotId: String?

    /// Same concept for searching a building/place by coordinate, but with
    /// destination-pin metadata so the Map can surface a temporary marker.
    @Published var focusDestination: FocusDestination?

    struct FocusDestination: Equatable, Identifiable {
        let id = UUID()
        let latitude: Double
        let longitude: Double
        let title: String
        let expiresAt: Date
    }
}
