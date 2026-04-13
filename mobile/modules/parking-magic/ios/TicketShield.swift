import Foundation

class TicketShield {
  static let shared = TicketShield()
  private var permitMappings: [String: [String]] = [:]

  init() {
    loadMappings()
  }

  private func loadMappings() {
    guard let path = Bundle.main.path(forResource: "permit_mapping", ofType: "json"),
          let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: [String]] else {
      return
    }
    self.permitMappings = json
  }

  func validateParking(permitType: String, lotId: String) -> Bool {
    guard let allowedLots = permitMappings[permitType] else { return false }
    return allowedLots.contains(lotId)
  }
}
