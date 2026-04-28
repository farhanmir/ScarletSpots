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
    let notifyParkingRestrictions: Bool
    let notifyFriendSameLot: Bool
    let notifyAutoParkStarted: Bool
    let notifyAutoParkEnded: Bool
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
        case notifyParkingRestrictions = "notify_parking_restrictions"
        case notifyFriendSameLot = "notify_friend_same_lot"
        case notifyAutoParkStarted = "notify_auto_park_started"
        case notifyAutoParkEnded = "notify_auto_park_ended"
        case createdAt = "created_at"
    }

    init(
        id: UUID,
        email: String,
        canAccessDiagnostics: Bool,
        firstName: String?,
        lastName: String?,
        avatarUrl: String?,
        permitType: String?,
        secondaryPermitType: String?,
        notifyParkingRestrictions: Bool,
        notifyFriendSameLot: Bool,
        notifyAutoParkStarted: Bool,
        notifyAutoParkEnded: Bool,
        createdAt: Date
    ) {
        self.id = id
        self.email = email
        self.canAccessDiagnostics = canAccessDiagnostics
        self.firstName = firstName
        self.lastName = lastName
        self.avatarUrl = avatarUrl
        self.permitType = permitType
        self.secondaryPermitType = secondaryPermitType
        self.notifyParkingRestrictions = notifyParkingRestrictions
        self.notifyFriendSameLot = notifyFriendSameLot
        self.notifyAutoParkStarted = notifyAutoParkStarted
        self.notifyAutoParkEnded = notifyAutoParkEnded
        self.createdAt = createdAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        email = try container.decode(String.self, forKey: .email)
        canAccessDiagnostics = try container.decodeIfPresent(Bool.self, forKey: .canAccessDiagnostics) ?? false
        firstName = try container.decodeIfPresent(String.self, forKey: .firstName)
        lastName = try container.decodeIfPresent(String.self, forKey: .lastName)
        avatarUrl = try container.decodeIfPresent(String.self, forKey: .avatarUrl)
        permitType = try container.decodeIfPresent(String.self, forKey: .permitType)
        secondaryPermitType = try container.decodeIfPresent(String.self, forKey: .secondaryPermitType)
        notifyParkingRestrictions = try container.decodeIfPresent(Bool.self, forKey: .notifyParkingRestrictions) ?? true
        notifyFriendSameLot = try container.decodeIfPresent(Bool.self, forKey: .notifyFriendSameLot) ?? false
        notifyAutoParkStarted = try container.decodeIfPresent(Bool.self, forKey: .notifyAutoParkStarted) ?? true
        notifyAutoParkEnded = try container.decodeIfPresent(Bool.self, forKey: .notifyAutoParkEnded) ?? true
        createdAt = try container.decode(Date.self, forKey: .createdAt)
    }
}
