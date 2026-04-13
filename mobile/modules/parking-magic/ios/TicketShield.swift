import Foundation

class TicketShield {
  static let shared = TicketShield()
  private var permitMappings: [String: Set<String>] = [:]

  init() {
    loadMappings()
  }

  private func loadMappings() {
    guard let path = Bundle.main.path(forResource: "permit_mapping", ofType: "json"),
          let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: [[String: Any]]] else {
      print("[TicketShield] Failed to load permit mapping JSON.")
      return
    }
    
    // Convert to simplified [PermitType: Set<LotID>]
    var processed: [String: Set<String>] = [:]
    for (permitType, lots) in json {
      var lotIds = Set<String>()
      for lot in lots {
        if let id = lot["id"] as? String {
          lotIds.insert(id)
        }
      }
      processed[permitType] = lotIds
    }
    
    print("[TicketShield] Hydrated \(processed.count) permit types.")
    self.permitMappings = processed
  }

  func validateParking(permitType: String, lotId: String) -> (isValid: Bool, message: String) {
    guard let allowedLots = permitMappings[permitType] else {
      return (false, "No permit found for: \(permitType)")
    }
    
    if allowedLots.contains(lotId) {
      return (true, "Authorized for this lot.")
    } else {
      return (false, "Unauthorized: \(permitType) is not valid for Lot \(lotId).")
    }
  }
}
