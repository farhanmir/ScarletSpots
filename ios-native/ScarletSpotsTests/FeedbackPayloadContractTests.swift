import XCTest
@testable import ScarletSpots

final class FeedbackPayloadContractTests: XCTestCase {
    func testFeedbackPayloadMatchesBackendContract() {
        let sessionId = UUID(uuidString: "00000000-0000-0000-0000-000000000123")!
        let payload = ParkAPI.feedbackPayload(
            sessionId: sessionId,
            lotId: "10001",
            rating: 5,
            notes: "great detection"
        )

        XCTAssertEqual(payload["session_id"] as? String, sessionId.uuidString)
        XCTAssertEqual(payload["lot_id"] as? String, "10001")
        XCTAssertEqual(payload["quality"] as? String, "correct")
        XCTAssertEqual(payload["notes"] as? String, "great detection")
        XCTAssertNil(payload["rating"])
    }
}
