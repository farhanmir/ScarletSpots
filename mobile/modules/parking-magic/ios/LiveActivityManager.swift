import ActivityKit
import Foundation

public struct ParkingAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    public var distance: String
    public var lotName: String
    public var timestamp: Date
  }
}

@available(iOS 16.2, *)
class LiveActivityManager {
  static let shared = LiveActivityManager()
  
  private var currentActivity: Activity<ParkingAttributes>?
  
  func startParkingActivity(lotName: String) {
    let initialState = ParkingAttributes.ContentState(
      distance: "0 ft",
      lotName: lotName,
      timestamp: Date()
    )
    
    let attributes = ParkingAttributes()
    
    do {
      currentActivity = try Activity.request(
        attributes: attributes,
        content: .init(state: initialState, staleDate: nil)
      )
    } catch {
      print("Error starting Live Activity: \(error.localizedDescription)")
    }
  }
  
  func updateActivity(distance: String) {
    guard let activity = currentActivity else { return }
    
    let updatedState = ParkingAttributes.ContentState(
      distance: distance,
      lotName: activity.content.state.lotName,
      timestamp: Date()
    )
    
    Task {
      await activity.update(.init(state: updatedState, staleDate: nil))
    }
  }
  
  func stopActivity() {
    Task {
      for activity in Activity<ParkingAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      currentActivity = nil
    }
  }
}
