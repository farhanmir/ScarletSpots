import Foundation

/// Permit → allowed lot IDs & operating hours.
///
/// Applies permit filtering and time-of-day availability checks for the native
/// iOS app.
///
/// Source data still lives in the canonical `permit_mapping.json` /
/// `permit_schedules.json` inside `ios/data-sources/`. The generator
/// turns them into relational tables (`permits`, `permit_lots`,
/// `permit_schedules`, `permit_schedule_slots`) which this repository reads.
/// Permit → lot-id mappings are small (~2400 rows) and read often enough to
/// justify caching in memory; per-lot schedule text and weekday slots are
/// queried on demand so we don't have to keep a 2 MB JSON tree around.
@MainActor
final class PermitRepository: ObservableObject {
    static let shared = PermitRepository()

    /// Sentinel used by the map filter to bypass permit logic entirely.
    static let noPermitAll = "__all"
    /// Sentinel used to show all commuter-accessible lots regardless of the
    /// user's permit.
    static let noPermitCommuter = "__commuter_all"

    private(set) var permitToLotIds: [String: Set<String>] = [:]
    private(set) var allPermitTypes: [String] = []
    private(set) var allCommuterLotIds: Set<String> = []

    private let db = Database.shared

    private init() {
        loadPermitMappings()
    }

    // MARK: - Loading

    private func loadPermitMappings() {
        var mapping: [String: Set<String>] = [:]
        var commuter: Set<String> = []

        db.query(
            """
            SELECT p.permit_type, p.is_commuter, pl.lot_id
            FROM permits p
            LEFT JOIN permit_lots pl ON pl.permit_type = p.permit_type
            """
        ) { stmt in
            while stmt.step() {
                let permit = stmt.stringOrEmpty(0)
                let isCommuter = stmt.bool(1)
                let lotId = stmt.string(2)

                // A permit with no matching lots still needs an entry so it
                // shows up in `allPermitTypes`.
                if mapping[permit] == nil {
                    mapping[permit] = []
                }
                if let lotId, !lotId.isEmpty {
                    mapping[permit]?.insert(lotId)
                    if isCommuter {
                        commuter.insert(lotId)
                    }
                }
            }
        }

        self.permitToLotIds = mapping
        self.allPermitTypes = mapping.keys.sorted()
        self.allCommuterLotIds = commuter
        Logger.log("PermitRepository: loaded \(mapping.count) permits (\(commuter.count) commuter lots)")
    }

    // MARK: - Permit → Lot ID lookups

    func lotIds(for permitType: String?) -> Set<String> {
        guard let permitType else { return [] }
        return permitToLotIds[permitType] ?? []
    }

    /// Union of the primary permit's lots with the secondary permit's lots.
    /// An empty secondary just returns the primary set.
    func lotIdsUnion(primary: String?, secondary: String?) -> Set<String> {
        let p = lotIds(for: primary)
        let s = lotIds(for: secondary)
        if p.isEmpty { return s }
        if s.isEmpty { return p }
        return p.union(s)
    }

    /// Filters `lots` by permit according to the same rules as the RN app:
    /// - `__all` → no filter
    /// - `__commuter_all` → every commuter-accessible lot
    /// - Real permit type → union of primary + secondary access lists
    /// - `nil` / unknown → empty list (treat as "no permit, no lots")
    func filtered(
        lots: [Lot],
        primary: String?,
        secondary: String?
    ) -> [Lot] {
        switch primary {
        case Self.noPermitAll:
            return lots
        case Self.noPermitCommuter:
            return lots.filter { allCommuterLotIds.contains($0.mapId) }
        case .some(let raw) where permitToLotIds[raw] != nil:
            let ids = lotIdsUnion(primary: raw, secondary: secondary)
            return lots.filter { ids.contains($0.mapId) }
        default:
            return []
        }
    }

    // MARK: - Schedule helpers

    /// Text that should be shown underneath a lot in the details sheet. Mirrors
    /// the RN `getLotScheduleInfo` helper — returns nil when no schedule
    /// exists for the pair.
    func scheduleText(permitType: String?, lotId: String) -> (String, String)? {
        guard let permitType else { return nil }
        return db.query(
            "SELECT time_text_1, time_text_2 FROM permit_schedules WHERE permit_type = ? AND lot_id = ?",
            bindings: [permitType, lotId]
        ) { stmt -> (String, String)? in
            guard stmt.step() else { return nil }
            let t1 = stmt.stringOrEmpty(0)
            let t2 = stmt.stringOrEmpty(1)
            guard !t1.isEmpty || !t2.isEmpty else { return nil }
            return (t1, t2)
        } ?? nil
    }

    /// Three-valued availability check:
    /// - `true`: lot is currently within operating hours for this permit.
    /// - `false`: lot is outside hours / closed today.
    /// - `nil`: we have no schedule data for this permit/lot (treat as "open").
    func isLotAvailableNow(
        permitType: String?,
        lotId: String,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> Bool? {
        guard let permitType else { return nil }

        let weekday = calendar.component(.weekday, from: now) - 1 // 0 = Sun
        let currentMinutes =
            calendar.component(.hour, from: now) * 60 +
            calendar.component(.minute, from: now)

        // Pull every slot for this (permit, lot) so we can distinguish "no
        // schedule at all" (→ nil) from "no slot for today" (→ false).
        let hasAny = db.query(
            "SELECT COUNT(*) FROM permit_schedules WHERE permit_type = ? AND lot_id = ?",
            bindings: [permitType, lotId]
        ) { stmt -> Bool in
            stmt.step() ? stmt.int(0) > 0 : false
        } ?? false

        guard hasAny else { return nil }

        let slots = db.select(
            """
            SELECT start_minute, end_minute
            FROM permit_schedule_slots
            WHERE permit_type = ? AND lot_id = ? AND weekday = ?
            """,
            bindings: [permitType, lotId, weekday]
        ) { stmt in
            (stmt.int(0), stmt.int(1))
        }

        if slots.isEmpty { return false }

        for (start, end) in slots {
            if currentMinutes >= start, currentMinutes < end {
                return true
            }
        }
        return false
    }

    /// Secondary-permit override: "main" commuter lots (schedule text
    /// "Monday - Friday, 6AM - 12AM" / "Saturday - Sunday, 6AM - 12AM") are
    /// only valid Monday-Friday 10:00-24:00.
    func isSecondaryPermitAvailableNow(
        permitType: String?,
        lotId: String,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> Bool? {
        guard let permitType else { return nil }
        guard let (t1, t2) = scheduleText(permitType: permitType, lotId: lotId) else {
            return nil
        }

        let lower1 = t1.trimmingCharacters(in: .whitespaces).lowercased()
        let lower2 = t2.trimmingCharacters(in: .whitespaces).lowercased()
        let isMainLotSchedule =
            lower1 == "monday - friday, 6am - 12am" &&
            lower2 == "saturday - sunday, 6am - 12am"

        guard isMainLotSchedule else {
            return isLotAvailableNow(permitType: permitType, lotId: lotId, now: now, calendar: calendar)
        }

        let weekday = calendar.component(.weekday, from: now)
        if weekday == 1 || weekday == 7 { return false }
        let minutes =
            calendar.component(.hour, from: now) * 60 +
            calendar.component(.minute, from: now)
        return minutes >= 10 * 60 && minutes < 24 * 60
    }
}
