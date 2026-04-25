import Foundation
import CryptoKit

final class PinningDelegate: NSObject, URLSessionDelegate {
  private let pinnedCertHashes: Set<String>

  init(pinnedCertHashes: Set<String>) {
    self.pinnedCertHashes = pinnedCertHashes
  }

  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
          let trust = challenge.protectionSpace.serverTrust else {
      completionHandler(.performDefaultHandling, nil)
      return
    }

    if pinnedCertHashes.isEmpty {
      completionHandler(.performDefaultHandling, nil)
      return
    }

    guard let cert = SecTrustGetCertificateAtIndex(trust, 0) else {
      completionHandler(.cancelAuthenticationChallenge, nil)
      return
    }
    let certData = SecCertificateCopyData(cert) as Data
    let digest = SHA256.hash(data: certData)
    let hash = Data(digest).base64EncodedString()
    if pinnedCertHashes.contains(hash) {
      completionHandler(.useCredential, URLCredential(trust: trust))
      return
    }
    completionHandler(.cancelAuthenticationChallenge, nil)
  }
}

struct ActiveSessionStatus {
  let isActive: Bool
  let lotId: String?
  let latitude: Double?
  let longitude: Double?
}

class NetworkManager {
  static let shared = NetworkManager()
  
  private var apiBaseUrl: String?
  private var authToken: String?
  private let stateQueue = DispatchQueue(label: "com.scarletspots.networkmanager.state")
  private var pinnedCertHashes: Set<String> = []

  var isConfigured: Bool {
    stateQueue.sync {
      apiBaseUrl != nil && authToken != nil
    }
  }
  
  private func credentials() -> (baseUrl: String, token: String, pins: Set<String>)? {
    stateQueue.sync {
      guard let base = apiBaseUrl, let token = authToken else { return nil }
      return (base, token, pinnedCertHashes)
    }
  }
  
  private func buildSession(pins: Set<String>) -> URLSession {
    let config = URLSessionConfiguration.ephemeral
    let delegate = PinningDelegate(pinnedCertHashes: pins)
    return URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
  }

  func configure(url: String, token: String, pinnedCertHashes: [String] = []) {
    stateQueue.sync {
      self.apiBaseUrl = url
      self.authToken = token
      self.pinnedCertHashes = Set(pinnedCertHashes)
    }
    print("[NetworkManager] Configured with \(url)")
  }
  
  func submitParkingEvent(
    lotId: String,
    latitude: Double,
    longitude: Double,
    source: String,
    autoStarted: Bool = true,
    idempotencyKey: String? = nil,
    completion: @escaping (Bool, String?, Bool) -> Void
  ) {
    guard let creds = credentials(),
          let url = URL(string: "\(creds.baseUrl)/api/v1/park/session") else {
      print("[NetworkManager] Not configured.")
      DispatchQueue.main.async { completion(false, nil, false) }
      return
    }
    
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(creds.token)", forHTTPHeaderField: "Authorization")
    if let idempotencyKey {
      request.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key")
    }
    
    let eventId = UUID().uuidString
    let body: [String: Any] = [
      "lotId": lotId,
      "latitude": latitude,
      "longitude": longitude,
      "autoStarted": autoStarted,
      "source": source
    ]
    
    request.httpBody = try? JSONSerialization.data(withJSONObject: body)
    
    let session = buildSession(pins: creds.pins)
    let task = session.dataTask(with: request) { _, response, error in
      if let error = error {
        print("[NetworkManager] Request failed: \(error.localizedDescription)")
        // Transport failures are retryable/offline-like.
        DispatchQueue.main.async { completion(false, eventId, true) }
        return
      }
      
      if let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) {
        print("[NetworkManager] Parking event reported successfully.")
        DispatchQueue.main.async { completion(true, eventId, false) }
      } else {
        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? -1
        let retryable = statusCode == 408 || statusCode == 429 || statusCode >= 500
        print("[NetworkManager] Server returned error status: \(statusCode), retryable=\(retryable)")
        DispatchQueue.main.async { completion(false, eventId, retryable) }
      }
    }
    task.resume()
  }

  func endParkingSession(completion: @escaping (Bool) -> Void) {
    guard let creds = credentials(),
          let url = URL(string: "\(creds.baseUrl)/api/v1/park/session/end") else {
      DispatchQueue.main.async { completion(false) }
      return
    }
    
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(creds.token)", forHTTPHeaderField: "Authorization")
    
    let session = buildSession(pins: creds.pins)
    let task = session.dataTask(with: request) { _, response, _ in
      let success = {
        guard let status = (response as? HTTPURLResponse)?.statusCode else { return false }
        return (200...299).contains(status)
      }()
      print("[NetworkManager] End session success: \(success)")
      DispatchQueue.main.async { completion(success) }
    }
    task.resume()
  }

  func fetchActiveParkingSession(completion: @escaping (ActiveSessionStatus?) -> Void) {
    guard let creds = credentials(),
          let url = URL(string: "\(creds.baseUrl)/api/v1/park/session/active") else {
      DispatchQueue.main.async { completion(nil) }
      return
    }

    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.setValue("Bearer \(creds.token)", forHTTPHeaderField: "Authorization")

    let session = buildSession(pins: creds.pins)
    let task = session.dataTask(with: request) { data, response, error in
      if let error = error {
        print("[NetworkManager] Active session fetch failed: \(error.localizedDescription)")
        DispatchQueue.main.async { completion(nil) }
        return
      }

      guard let httpResponse = response as? HTTPURLResponse,
            (200...299).contains(httpResponse.statusCode),
            let data = data,
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        DispatchQueue.main.async { completion(nil) }
        return
      }

      guard let session = json["session"] as? [String: Any] else {
        DispatchQueue.main.async {
          completion(ActiveSessionStatus(isActive: false, lotId: nil, latitude: nil, longitude: nil))
        }
        return
      }

      let isActive = (session["active"] as? Bool) ?? false
      let lotId = (session["lotId"] as? String) ?? (session["lot_id"] as? String)
      let latitude = session["latitude"] as? Double
      let longitude = session["longitude"] as? Double
      DispatchQueue.main.async {
        completion(ActiveSessionStatus(isActive: isActive, lotId: lotId, latitude: latitude, longitude: longitude))
      }
    }
    task.resume()
  }

  func reset() {
    stateQueue.sync {
      self.apiBaseUrl = nil
      self.authToken = nil
    }
    print("[NetworkManager] Session state reset.")
  }

  func reportVultureActivity(lotId: String) {
    guard let creds = credentials(),
          let url = URL(string: "\(creds.baseUrl)/api/v1/lots/\(lotId)/vulture") else {
      return
    }
    
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(creds.token)", forHTTPHeaderField: "Authorization")
    
    let session = buildSession(pins: creds.pins)
    session.dataTask(with: request).resume()
    print("[NetworkManager] Reported vulture activity for \(lotId)")
  }
}
