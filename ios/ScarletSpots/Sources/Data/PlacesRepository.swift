import Foundation

/// Rutgers locations (the legacy locations.json directory). These entries
/// don't carry coordinates — the Search screen geocodes them on tap via
/// `CLGeocoder`. Backed by the bundled SQLite database.
struct Place: Identifiable, Hashable {
    let id: String
    let name: String
    let address: String
    let campus: String?
    let aliases: String?
}

enum PlacesRepository {
    /// Full places list. Primarily used as the substring-fallback pool for
    /// 1–2 character queries where FTS5 trigram indexing can't help.
    static func all() -> [Place] {
        Database.shared.select(
            "SELECT id, name, address, campus, aliases FROM places ORDER BY name"
        ) { stmt in
            Place(
                id: stmt.stringOrEmpty(0),
                name: stmt.stringOrEmpty(1),
                address: stmt.stringOrEmpty(2),
                campus: stmt.string(3),
                aliases: stmt.string(4)
            )
        }
    }

    /// FTS5 typeahead. Falls back to the old substring scan when the query is
    /// empty, too short for trigram, or FTS finds nothing.
    static func search(_ term: String, limit: Int = 8) -> [Place] {
        let normalized = term.trimmingCharacters(in: .whitespacesAndNewlines)
        if normalized.isEmpty {
            return Array(all().prefix(limit))
        }

        if let phrase = FTS5.phraseQuery(normalized) {
            let rows = Database.shared.select(
                """
                SELECT p.id, p.name, p.address, p.campus, p.aliases
                FROM places_fts f
                JOIN places p ON p.id = f.id
                WHERE places_fts MATCH ?
                LIMIT ?
                """,
                bindings: [phrase, limit]
            ) { stmt in
                Place(
                    id: stmt.stringOrEmpty(0),
                    name: stmt.stringOrEmpty(1),
                    address: stmt.stringOrEmpty(2),
                    campus: stmt.string(3),
                    aliases: stmt.string(4)
                )
            }
            if !rows.isEmpty { return rows }
        }

        let lowered = normalized.lowercased()
        return Array(
            all()
                .filter {
                    $0.name.lowercased().contains(lowered)
                        || ($0.aliases?.lowercased().contains(lowered) ?? false)
                        || $0.address.lowercased().contains(lowered)
                }
                .prefix(limit)
        )
    }
}
