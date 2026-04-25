import Foundation

/// Permit → allowed lot IDs & operating hours.
///
/// Mirrors the TypeScript logic in `mobile/src/shared/constants/lots.ts` so the
/// iOS app applies the same permit filtering and time-of-day availability
/// checks as the React Native app. Loaded once at app launch from the bundled
/// JSON resources.
@MainActor
final class PermitRepository: ObservableObject {
    static let shared = PermitRepository()

    /// Sentinel used by the map filter to bypass permit logic entirely.
    static let noPermitAll = "__all"
    /// Sentinel used to show all commuter-accessible lots regardless of the
    /// user's permit.
    static let noPermitCommuter = "__commuter_all"

    struct ScheduleSlot: Decodable, Hashable {
        let start: String
        let end: String
    }

    struct ScheduleInfo: Decodable {
        /// 7-element array keyed by `Calendar.component(.weekday)` minus 1
        /// (0 = Sunday … 6 = Saturday) — exactly the same as
        /// JavaScript's `Date#getDay()`.
        let schedule: [[ScheduleSlot]]
        let time_text_1: String?
        let time_text_2: String?
    }

    private(set) var permitToLotIds: [String: Set<String>] = [:]
    private(set) var allPermitTypes: [String] = []
    private(set) var allCommuterLotIds: Set<String> = []
    private(set) var schedules: [String: [String: ScheduleInfo]] = [:]

    private init() {
        loadPermitMapping()
        loadSchedules()
    }

    // MARK: - Loading

    private func loadPermitMapping() {
        guard let url = Bundle.main.url(forResource: "permit_mapping", withExtension: "json") else {
            Logger.log("PermitRepository: permit_mapping.json missing from bundle")
            return
        }
        struct Entry: Decodable { let id: String; let name: String? }
        do {
            let data = try Data(contentsOf: url)
            let decoded = try JSONDecoder().decode([String: [Entry]].self, from: data)
            var mapping: [String: Set<String>] = [:]
            var commuter: Set<String> = []
            for (permit, entries) in decoded {
                let ids = Set(entries.map(\.id))
                mapping[permit] = ids
                if permit.lowercased().contains("commuter") {
                    commuter.formUnion(ids)
                }
            }
            self.permitToLotIds = mapping
            self.allPermitTypes = mapping.keys.sorted()
            self.allCommuterLotIds = commuter
            Logger.log("PermitRepository: loaded \(mapping.count) permits (\(commuter.count) commuter lots)")
        } catch {
            Logger.log("PermitRepository: failed to decode permit_mapping — \(error)")
        }
    }

    private func loadSchedules() {
        guard let url = Bundle.main.url(forResource: "permit_schedules", withExtension: "json") else {
            Logger.log("PermitRepository: permit_schedules.json missing from bundle")
            return
        }
        do {
            let data = try Data(contentsOf: url)
            let decoded = try JSONDecoder().decode([String: [String: ScheduleInfo]].self, from: data)
            self.schedules = decoded
            Logger.log("PermitRepository: loaded schedules for \(decoded.count) permits")
        } catch {
            Logger.log("PermitRepository: failed to decode permit_schedules — \(error)")
        }
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
        guard let permitType,
              let info = schedules[permitType]?[lotId],
              (info.time_text_1?.isEmpty == false) || (info.time_text_2?.isEmpty == false)
        else { return nil }
        return (info.time_text_1 ?? "", info.time_text_2 ?? "")
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
        guard let permitType,
              let info = schedules[permitType]?[lotId]
        else { return nil }

        let weekday = calendar.component(.weekday, from: now) // 1 = Sun
        let dayIndex = weekday - 1
        guard dayIndex >= 0, dayIndex < info.schedule.count else { return nil }
        let slots = info.schedule[dayIndex]
        if slots.isEmpty { return false }

        let hour = calendar.component(.hour, from: now)
        let minute = calendar.component(.minute, from: now)
        let currentMinutes = hour * 60 + minute

        for slot in slots {
            guard let range = parseRange(start: slot.start, end: slot.end) else { continue }
            if currentMinutes >= range.0, currentMinutes < range.1 {
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
        guard let permitType,
              let info = schedules[permitType]?[lotId] else { return nil }

        let t1 = (info.time_text_1 ?? "").trimmingCharacters(in: .whitespaces).lowercased()
        let t2 = (info.time_text_2 ?? "").trimmingCharacters(in: .whitespaces).lowercased()
        let isMainLotSchedule =
            t1 == "monday - friday, 6am - 12am" &&
            t2 == "saturday - sunday, 6am - 12am"

        guard isMainLotSchedule else {
            return isLotAvailableNow(permitType: permitType, lotId: lotId, now: now, calendar: calendar)
        }

        let weekday = calendar.component(.weekday, from: now)
        if weekday == 1 || weekday == 7 { return false }
        let minutes = calendar.component(.hour, from: now) * 60 + calendar.component(.minute, from: now)
        return minutes >= 10 * 60 && minutes < 24 * 60
    }

    private func parseRange(start: String, end: String) -> (Int, Int)? {
        func toMinutes(_ text: String) -> Int? {
            let parts = text.split(separator: ":").compactMap { Int($0) }
            guard parts.count == 2 else { return nil }
            return parts[0] * 60 + parts[1]
        }
        guard let s = toMinutes(start), let e = toMinutes(end) else { return nil }
        return (s, e)
    }
}
