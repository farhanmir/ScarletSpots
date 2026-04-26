import Foundation

/// Rutgers buildings used by the Search tab (plus anything else that wants a
/// static campus landmark lookup). Backed by the bundled SQLite database —
/// the canonical source is still `ios-native/data-sources/buildings.json`,
/// which the generator script rebuilds into the `buildings` table.
enum BuildingRepository {
    /// Full building list ordered by campus then name for stable display.
    static func all() -> [Building] {
        Database.shared.select(
            "SELECT name, latitude, longitude, address, campus FROM buildings ORDER BY campus, name"
        ) { stmt in
            Building(
                name: stmt.stringOrEmpty(0),
                latitude: stmt.double(1),
                longitude: stmt.double(2),
                address: stmt.stringOrEmpty(3),
                campus: stmt.stringOrEmpty(4)
            )
        }
    }

    /// FTS5 typeahead for the Search tab. Short queries (< 3 chars) fall back
    /// to a substring scan of `all()` since the trigram tokenizer can't index
    /// 1–2 character tokens.
    static func search(_ term: String, limit: Int = 15) -> [Building] {
        let normalized = term.trimmingCharacters(in: .whitespacesAndNewlines)
        if normalized.isEmpty {
            return Array(all().prefix(limit))
        }

        if let phrase = FTS5.phraseQuery(normalized) {
            let rows = Database.shared.select(
                """
                SELECT b.name, b.latitude, b.longitude, b.address, b.campus
                FROM buildings_fts f
                JOIN buildings b ON b.name = f.name
                WHERE buildings_fts MATCH ?
                LIMIT ?
                """,
                bindings: [phrase, limit]
            ) { stmt in
                Building(
                    name: stmt.stringOrEmpty(0),
                    latitude: stmt.double(1),
                    longitude: stmt.double(2),
                    address: stmt.stringOrEmpty(3),
                    campus: stmt.stringOrEmpty(4)
                )
            }
            if !rows.isEmpty { return rows }
        }

        let lowered = normalized.lowercased()
        return Array(
            all()
                .filter {
                    $0.name.lowercased().contains(lowered)
                        || $0.address.lowercased().contains(lowered)
                        || $0.campus.lowercased().contains(lowered)
                }
                .prefix(limit)
        )
    }
}
