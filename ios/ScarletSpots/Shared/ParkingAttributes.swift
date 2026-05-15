import Foundation
import ActivityKit

/// ActivityAttributes describing an in-progress parking session.
///
/// This file is included in BOTH the main app target and the widget extension
/// target so the Live Activity contract is bit-identical on both sides — a
/// mismatch would cause `Activity.request(attributes:)` to be ignored by the
/// widget bundle and the Lock Screen / Dynamic Island UI to stay blank.
public struct ParkingAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// Human readable short lot name (e.g. "Lot 53A").
        public var lotName: String
        /// Formatted distance to the parked car (e.g. "120 ft", "0.3 mi").
        public var distance: String
        /// Unix time when the session started. Used for duration display.
        public var startedAt: Date
        /// Deck or garage level when the user set one (garage/deck lots only).
        public var deckLevelSubtitle: String?

        public init(lotName: String, distance: String, startedAt: Date, deckLevelSubtitle: String? = nil) {
            self.lotName = lotName
            self.distance = distance
            self.startedAt = startedAt
            self.deckLevelSubtitle = deckLevelSubtitle
        }
    }

    /// The internal lot id (mapId) is a static attribute — it never changes for
    /// a given activity, so it lives outside `ContentState`.
    public var lotId: String

    public init(lotId: String) {
        self.lotId = lotId
    }
}
