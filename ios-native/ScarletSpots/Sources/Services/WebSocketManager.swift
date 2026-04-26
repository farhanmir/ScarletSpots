import Combine
import Foundation

@MainActor
final class WebSocketManager: ObservableObject {
    static let shared = WebSocketManager()

    private var socket: AuthedWebSocket?
    private var pollingTask: Task<Void, Never>?

    @Published var lotOccupancies: [String: Int] = [:]
    @Published var lotOccupancyRows: [String: OccupancyRow] = [:]

    private init() {}

    func connect() {
        guard socket == nil else { return }

        let baseURL = Env.apiBaseURL
        guard let wsBase = WebSocketURL.wsScheme(from: baseURL) else {
            Logger.log("WebSocketManager: failed to derive ws URL from \(baseURL)")
            return
        }
        let endpoint = wsBase.appendingPathComponent("ws/occupancy")

        let lotIds = LotRepository.shared.getAll(includeAllCampuses: FeatureFlags.enableAllCampuses).map(\.mapId)
        socket = AuthedWebSocket(endpoint: endpoint, authPayload: ["lot_ids": lotIds]) { [weak self] payload in
            Task { @MainActor [weak self] in
                guard let self else { return }
                if let lot = payload["lot_id"] as? String, let count = payload["count"] as? Int {
                    self.lotOccupancies[lot] = count
                    let existing = self.lotOccupancyRows[lot]
                    self.lotOccupancyRows[lot] = OccupancyRow(
                        lotId: lot,
                        count: count,
                        occupancyRate: existing?.occupancyRate,
                        source: "realtime",
                        confidenceInterval: existing?.confidenceInterval,
                        updatedAt: Date()
                    )
                }
            }
        }
        socket?.start(accessTokenProvider: { AuthManager.shared.accessToken })

        pollingTask?.cancel()
        pollingTask = Task { [weak self] in
            while !Task.isCancelled {
                if let rows = try? await LotsAPI.occupancy() {
                    await MainActor.run { [weak self] in
                        for row in rows {
                            self?.lotOccupancies[row.lotId] = row.count ?? 0
                            self?.lotOccupancyRows[row.lotId] = row
                        }
                    }
                }
                try? await Task.sleep(nanoseconds: 15_000_000_000)
            }
        }
    }

    func disconnect() {
        socket?.stop()
        socket = nil
        pollingTask?.cancel()
        pollingTask = nil
    }
}
