import Foundation

struct Profile: Codable, Identifiable {
    let id: UUID
    let email: String
    let canAccessDiagnostics: Bool
    let firstName: String?
    let lastName: String?
    let avatarUrl: String?
    let permitType: String?
    let secondaryPermitType: String?
    let createdAt: Date
    
    enum CodingKeys: String, CodingKey {
        case id
        case email
        case canAccessDiagnostics = "can_access_diagnostics"
        case firstName = "first_name"
        case lastName = "last_name"
        case avatarUrl = "avatar_url"
        case permitType = "permit_type"
        case secondaryPermitType = "secondary_permit_type"
        case createdAt = "created_at"
    }
}
