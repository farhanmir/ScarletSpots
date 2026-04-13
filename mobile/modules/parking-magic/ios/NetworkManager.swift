import Foundation

class NetworkManager {
  static let shared = NetworkManager()
  
  private var apiBaseUrl: String?
  private var authToken: String?
  
  func configure(url: String, token: String) {
    self.apiBaseUrl = url
    self.authToken = token
    print("[NetworkManager] Configured with \(url)")
  }
  
  func submitParkingEvent(lotId: String, latitude: Double, longitude: Double, source: String, autoStarted: Bool = true, completion: @escaping (Bool) -> Void) {
    guard let urlString = apiBaseUrl, 
          let url = URL(string: "\(urlString)/api/v1/park/session"),
          let token = authToken else {
      print("[NetworkManager] Not configured.")
      completion(false)
      return
    }
    
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    
    let body: [String: Any] = [
      "lotId": lotId,
      "latitude": latitude,
      "longitude": longitude,
      "autoStarted": autoStarted,
      "source": source
    ]
    
    request.httpBody = try? JSONSerialization.data(withJSONObject: body)
    
    let task = URLSession.shared.dataTask(with: request) { _, response, error in
      if let error = error {
        print("[NetworkManager] Request failed: \(error.localizedDescription)")
        completion(false)
        return
      }
      
      if let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) {
        print("[NetworkManager] Parking event reported successfully.")
        completion(true)
      } else {
        print("[NetworkManager] Server returned error status.")
        completion(false)
      }
    }
    task.resume()
  }

  func endParkingSession(completion: @escaping (Bool) -> Void) {
    guard let urlString = apiBaseUrl, 
          let url = URL(string: "\(urlString)/api/v1/park/session/active"),
          let token = authToken else {
      completion(false)
      return
    }
    
    var request = URLRequest(url: url)
    request.httpMethod = "DELETE"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    
    let task = URLSession.shared.dataTask(with: request) { _, response, error in
      let success = (response as? HTTPURLResponse)?.statusCode == 200
      print("[NetworkManager] End session success: \(success)")
      completion(success)
    }
    task.resume()
  }

  func reportVultureActivity(lotId: String) {
    guard let urlString = apiBaseUrl, 
          let url = URL(string: "\(urlString)/api/v1/lots/\(lotId)/vulture"),
          let token = authToken else {
      return
    }
    
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    
    URLSession.shared.dataTask(with: request).resume()
    print("[NetworkManager] Reported vulture activity for \(lotId)")
  }
}
