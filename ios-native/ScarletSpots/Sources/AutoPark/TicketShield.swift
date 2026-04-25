import Foundation

final class TicketShield {
    static let shared = TicketShield()
    private var permitMappings: [String: Set<String>] = [:]

    private init() {
        guard let path = Bundle.main.url(forResource: "permit_mapping", withExtension: "json"),
              let data = try? Data(contentsOf: path),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: [[String: Any]]] else {
            return
        }
        var mapped: [String: Set<String>] = [:]
        for (permit, entries) in json {
            mapped[permit] = Set(entries.compactMap { $0["id"] as? String })
        }
        permitMappings = mapped
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
