import Foundation

/// Resilient web socket helper with exponential backoff reconnect and a
/// keep-alive ping loop.
///
/// Notes:
/// - The ping timer uses `DispatchSourceTimer` so it doesn't depend on the
///   run loop of whatever thread happened to start the socket.
/// - Scheme conversion uses `URLComponents` to avoid the chained-replace
///   footgun where `http` inside `https` is accidentally rewritten.
final class AuthedWebSocket {
    private var task: URLSessionWebSocketTask?
    private var pingTimer: DispatchSourceTimer?
    private var retryCount = 0
    private var isStopped = false
    private let endpoint: URL
    private let authPayload: [String: Any]
    private let onMessage: ([String: Any]) -> Void
    private let lock = NSLock()

    /// Session that enforces the same TLS pins as `APIClient`. Falls back
    /// to system trust when `Env.tlsPins` is empty.
    private static let pinnedSession: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        let delegate = PinnedURLSessionDelegate(pins: Env.tlsPins)
        return URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
    }()

    init(
        endpoint: URL,
        authPayload: [String: Any] = [:],
        onMessage: @escaping ([String: Any]) -> Void
    ) {
        self.endpoint = endpoint
        self.authPayload = authPayload
        self.onMessage = onMessage
    }

    func start(accessTokenProvider: @escaping () -> String?) {
        isStopped = false
        connect(accessTokenProvider: accessTokenProvider)
    }

    func stop() {
        lock.lock()
        isStopped = true
        pingTimer?.cancel()
        pingTimer = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        lock.unlock()
    }

    // MARK: - Private

    private func connect(accessTokenProvider: @escaping () -> String?) {
        // Some backends enforce an Origin allow-list; send one that matches
        // our bundle id so those checks pass without impersonating a browser.
        let bundleId = Bundle.main.bundleIdentifier ?? "com.scarletspots.app"
        var request = URLRequest(url: endpoint)
        request.setValue("scarletspots://\(bundleId)", forHTTPHeaderField: "Origin")
        task = Self.pinnedSession.webSocketTask(with: request)
        task?.resume()

        Task {
            guard let token = accessTokenProvider() else {
                scheduleReconnect(accessTokenProvider: accessTokenProvider)
                return
            }
            var auth: [String: Any] = ["type": "auth", "token": token]
            for (k, v) in authPayload { auth[k] = v }
            let attestation = await AttestationService.shared.websocketPayload(accessToken: token)
            for (k, v) in attestation { auth[k] = v }
            if let data = try? JSONSerialization.data(withJSONObject: auth),
               let text = String(data: data, encoding: .utf8) {
                try? await task?.send(.string(text))
            }
            retryCount = 0
            setupPing()
            receiveLoop(accessTokenProvider: accessTokenProvider)
        }
    }

    private func receiveLoop(accessTokenProvider: @escaping () -> String?) {
        task?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let message):
                if case let .string(text) = message,
                   let data = text.data(using: .utf8),
                   let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    self.onMessage(json)
                }
                self.receiveLoop(accessTokenProvider: accessTokenProvider)
            case .failure(let error):
                Logger.log("WS receive failed: \(error.localizedDescription)")
                self.scheduleReconnect(accessTokenProvider: accessTokenProvider)
            }
        }
    }

    private func setupPing() {
        lock.lock()
        pingTimer?.cancel()
        let timer = DispatchSource.makeTimerSource(queue: DispatchQueue.global(qos: .utility))
        timer.schedule(deadline: .now() + 25, repeating: 25)
        timer.setEventHandler { [weak self] in
            guard let self, let task = self.task else { return }
            let payload = #"{"type":"ping"}"#
            Task { try? await task.send(.string(payload)) }
        }
        pingTimer = timer
        timer.resume()
        lock.unlock()
    }

    private func scheduleReconnect(accessTokenProvider: @escaping () -> String?) {
        lock.lock()
        let stopped = isStopped
        pingTimer?.cancel()
        pingTimer = nil
        lock.unlock()
        guard !stopped else { return }
        let delay = min(30.0, 1.5 * pow(2.0, Double(retryCount)))
        retryCount += 1
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self, !self.isStopped else { return }
            self.connect(accessTokenProvider: accessTokenProvider)
        }
    }
}

// MARK: - URL helpers

enum WebSocketURL {
    /// Flip a `http(s)://host/api/v1` URL to `ws(s)://host/api/v1`.
    static func wsScheme(from url: URL) -> URL? {
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return nil
        }
        switch components.scheme {
        case "https": components.scheme = "wss"
        case "http": components.scheme = "ws"
        default: break
        }
        return components.url
    }
}
