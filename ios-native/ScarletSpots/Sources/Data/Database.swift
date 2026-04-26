import Foundation
import SQLite3

/// Thin, read-only wrapper around the system SQLite3 C API.
///
/// Backed by a single bundled `.sqlite` database that is generated offline by
/// `ios-native/scripts/build_sqlite.py` from the canonical JSON sources. No
/// migrations happen at runtime — if the schema changes, regenerate the file
/// and ship a new build.
///
/// Read-only + `SQLITE_OPEN_FULLMUTEX` makes the handle safe to share between
/// threads without extra synchronization, so repositories just grab the shared
/// instance and query directly.
final class Database {
    /// Return value bindings required by SQLite column callbacks.
    static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    let handle: OpaquePointer

    private init(handle: OpaquePointer) {
        self.handle = handle
    }

    deinit {
        sqlite3_close_v2(handle)
    }

    /// Opens a database bundled with the app in read-only mode. Returns `nil`
    /// if the file is missing (e.g. the build step forgot to regenerate it)
    /// or if SQLite rejects it for any reason.
    static func openBundled(resource: String, withExtension ext: String = "sqlite") -> Database? {
        guard let url = Bundle.main.url(forResource: resource, withExtension: ext) else {
            Logger.log("Database: bundled resource missing — \(resource).\(ext)")
            return nil
        }
        var handle: OpaquePointer?
        let flags = SQLITE_OPEN_READONLY | SQLITE_OPEN_FULLMUTEX
        let rc = sqlite3_open_v2(url.path, &handle, flags, nil)
        guard rc == SQLITE_OK, let h = handle else {
            if let h = handle { sqlite3_close_v2(h) }
            let err = handle.map { String(cString: sqlite3_errmsg($0)) } ?? "unknown"
            Logger.log("Database: failed to open \(url.path) (rc=\(rc)) — \(err)")
            return nil
        }
        // Trades a little memory for measurably faster repeated lookups on a
        // cold cache.
        sqlite3_exec(h, "PRAGMA cache_size = -4096", nil, nil, nil)
        return Database(handle: h)
    }

    /// Prepare a statement, run `body` with it, and finalize. Returns the
    /// result of `body` — usually an array of decoded rows. Logs and returns
    /// `nil` on preparation failure.
    @discardableResult
    func query<T>(_ sql: String, bindings: [SQLBindable?] = [], body: (Statement) throws -> T) rethrows -> T? {
        var raw: OpaquePointer?
        let rc = sqlite3_prepare_v2(handle, sql, -1, &raw, nil)
        guard rc == SQLITE_OK, let raw else {
            let err = String(cString: sqlite3_errmsg(handle))
            Logger.log("Database.query: prepare failed (rc=\(rc)) — \(err)\n  sql=\(sql)")
            return nil
        }
        let stmt = Statement(raw: raw)
        defer { stmt.finalize() }
        for (index, value) in bindings.enumerated() {
            let position = Int32(index + 1)
            if value == nil {
                sqlite3_bind_null(raw, position)
            } else {
                value!.bind(to: raw, at: position)
            }
        }
        return try body(stmt)
    }

    /// Convenience for "execute statement once and collect rows via a mapper".
    func select<T>(
        _ sql: String,
        bindings: [SQLBindable?] = [],
        map: (Statement) -> T
    ) -> [T] {
        var out: [T] = []
        query(sql, bindings: bindings) { stmt in
            while stmt.step() {
                out.append(map(stmt))
            }
        }
        return out
    }

    /// Run an SQL statement that doesn't return rows (unused in read-only
    /// code paths today, but useful for PRAGMA toggles).
    func exec(_ sql: String) {
        sqlite3_exec(handle, sql, nil, nil, nil)
    }
}

// MARK: - Shared instance

extension Database {
    /// Shared handle for the bundled ScarletSpots database. Lazily opened and
    /// never torn down — the file is read-only and tiny to keep in memory.
    static let shared: Database = {
        guard let db = Database.openBundled(resource: "scarletspots") else {
            fatalError("scarletspots.sqlite is missing from the app bundle. Regenerate it with ios-native/scripts/build_sqlite.py")
        }
        return db
    }()
}

// MARK: - Statement

final class Statement {
    let raw: OpaquePointer

    init(raw: OpaquePointer) {
        self.raw = raw
    }

    /// Advance to the next row. Returns `true` while `SQLITE_ROW` keeps coming
    /// back, `false` once the result set is exhausted or on error.
    func step() -> Bool {
        sqlite3_step(raw) == SQLITE_ROW
    }

    func finalize() {
        sqlite3_finalize(raw)
    }

    // MARK: Column access (zero-indexed)

    func int(_ column: Int32) -> Int {
        Int(sqlite3_column_int64(raw, column))
    }

    func int32(_ column: Int32) -> Int32 {
        sqlite3_column_int(raw, column)
    }

    func bool(_ column: Int32) -> Bool {
        sqlite3_column_int(raw, column) != 0
    }

    func double(_ column: Int32) -> Double {
        sqlite3_column_double(raw, column)
    }

    /// Returns `nil` if the column value is SQL NULL, otherwise a Swift
    /// `String` copy (SQLite returns UTF-8).
    func string(_ column: Int32) -> String? {
        guard sqlite3_column_type(raw, column) != SQLITE_NULL,
              let cStr = sqlite3_column_text(raw, column) else { return nil }
        return String(cString: cStr)
    }

    /// Non-optional string helper — returns empty string for NULL columns.
    func stringOrEmpty(_ column: Int32) -> String {
        string(column) ?? ""
    }

    /// Reads a blob column into a Data copy. Returns an empty Data if the
    /// column is NULL or zero-length.
    func data(_ column: Int32) -> Data {
        let byteCount = Int(sqlite3_column_bytes(raw, column))
        guard byteCount > 0, let pointer = sqlite3_column_blob(raw, column) else {
            return Data()
        }
        return Data(bytes: pointer, count: byteCount)
    }

    /// Optimized reinterpretation of a blob column as an array of `Double`.
    /// The generator writes polygon points as little-endian native doubles,
    /// which match ARM64 byte order, so this is effectively a memcpy.
    func doubles(_ column: Int32) -> [Double] {
        let byteCount = Int(sqlite3_column_bytes(raw, column))
        guard byteCount > 0, byteCount % 8 == 0, let pointer = sqlite3_column_blob(raw, column) else {
            return []
        }
        let doubleCount = byteCount / 8
        let buffer = pointer.assumingMemoryBound(to: Double.self)
        return Array(UnsafeBufferPointer(start: buffer, count: doubleCount))
    }
}

// MARK: - Binding helpers

protocol SQLBindable {
    func bind(to statement: OpaquePointer, at index: Int32)
}

extension String: SQLBindable {
    func bind(to statement: OpaquePointer, at index: Int32) {
        sqlite3_bind_text(statement, index, self, -1, Database.transient)
    }
}

extension Int: SQLBindable {
    func bind(to statement: OpaquePointer, at index: Int32) {
        sqlite3_bind_int64(statement, index, Int64(self))
    }
}

extension Int32: SQLBindable {
    func bind(to statement: OpaquePointer, at index: Int32) {
        sqlite3_bind_int(statement, index, self)
    }
}

extension Int64: SQLBindable {
    func bind(to statement: OpaquePointer, at index: Int32) {
        sqlite3_bind_int64(statement, index, self)
    }
}

extension Double: SQLBindable {
    func bind(to statement: OpaquePointer, at index: Int32) {
        sqlite3_bind_double(statement, index, self)
    }
}

extension Bool: SQLBindable {
    func bind(to statement: OpaquePointer, at index: Int32) {
        sqlite3_bind_int(statement, index, self ? 1 : 0)
    }
}

// MARK: - FTS5 helpers

enum FTS5 {
    /// Minimum query length the trigram tokenizer needs to return any rows.
    /// Shorter queries should use a non-FTS fallback (e.g. substring scan).
    static let minQueryLength = 3

    /// Wrap arbitrary user text as a single phrase query so special FTS5
    /// operators (`OR`, `NEAR`, `:`, `/`, quotes …) can't break the parser.
    /// Returns `nil` for inputs that can never match under trigram tokenization.
    static func phraseQuery(_ raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= minQueryLength else { return nil }
        // Double any embedded quotes — FTS5 uses doubled quotes to escape.
        let escaped = trimmed.replacingOccurrences(of: "\"", with: "\"\"")
        return "\"\(escaped)\""
    }
}
