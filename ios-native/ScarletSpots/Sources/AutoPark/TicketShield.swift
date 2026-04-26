import Foundation

/// Permit / lot validator used by the AutoPark confidence pipeline. Shares
/// the same permit → lot-id mapping that `PermitRepository` uses, just with a
/// much smaller surface area. The data comes from the bundled SQLite database
/// (`permit_lots` table) so the source of truth stays unified.
final class TicketShield {
    static let shared = TicketShield()

    private let permitMappings: [String: Set<String>]

    private init() {
        var mapped: [String: Set<String>] = [:]
        Database.shared.query(
            "SELECT permit_type, lot_id FROM permit_lots"
        ) { stmt in
            while stmt.step() {
                let permit = stmt.stringOrEmpty(0)
                let lotId = stmt.stringOrEmpty(1)
                guard !permit.isEmpty, !lotId.isEmpty else { continue }
                mapped[permit, default: []].insert(lotId)
            }
        }
        self.permitMappings = mapped
    }

    func validateParking(permitType: String, lotId: String) -> (isValid: Bool, message: String) {
        guard let allowed = permitMappings[permitType] else {
            return (false, "No permit mapping found")
        }
        return allowed.contains(lotId)
            ? (true, "Authorized")
            : (false, "Permit does not allow this lot")
    }
}
