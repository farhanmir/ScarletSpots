import Foundation

enum Logger {
    struct LogEntry: Codable, Identifiable {
        let id: UUID
        let timestamp: Date
        let level: String
        let category: String
        let message: String
        let metadata: [String: String]
    }

    private static let maxEntries = 500
    private static var entries: [LogEntry] = []
    private static let lockQueue = DispatchQueue(label: "com.scarletspots.logger.lock")

    static func log(_ message: String) {
        print("[ScarletSpots] \(message)")
        append(level: "info", category: "app", message: message, metadata: [:])
    }

    static func event(
        _ category: String,
        _ message: String,
        metadata: [String: String] = [:],
        level: String = "info"
    ) {
        let sortedMeta = metadata.sorted { $0.key < $1.key }
            .map { "\($0.key)=\($0.value)" }
            .joined(separator: " ")
        let suffix = sortedMeta.isEmpty ? "" : " | \(sortedMeta)"
        print("[ScarletSpots][\(category)][\(level)] \(message)\(suffix)")
        append(level: level, category: category, message: message, metadata: metadata)
    }

    static func recentEntries(limit: Int = 200) -> [LogEntry] {
        lockQueue.sync {
            if limit <= 0 { return [] }
            return Array(entries.suffix(limit))
        }
    }

    static func clear() {
        lockQueue.sync {
            entries.removeAll()
        }
    }

    static func exportJSONString(limit: Int = 300) -> String {
        let payload: [String: Any] = [
            "generatedAt": ISO8601DateFormatter().string(from: Date()),
            "entryCount": min(limit, entries.count),
            "entries": recentEntries(limit: limit).map {
                [
                    "id": $0.id.uuidString,
                    "timestamp": ISO8601DateFormatter().string(from: $0.timestamp),
                    "level": $0.level,
                    "category": $0.category,
                    "message": $0.message,
                    "metadata": $0.metadata
                ] as [String: Any]
            }
        ]
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted]),
              let json = String(data: data, encoding: .utf8)
        else {
            return "{\"error\":\"failed_to_encode_logs\"}"
        }
        return json
    }

    private static func append(level: String, category: String, message: String, metadata: [String: String]) {
        lockQueue.sync {
            entries.append(
                LogEntry(
                    id: UUID(),
                    timestamp: Date(),
                    level: level,
                    category: category,
                    message: message,
                    metadata: metadata
                )
            )
            if entries.count > maxEntries {
                entries.removeFirst(entries.count - maxEntries)
            }
        }
    }
}
