import Foundation
import SQLite3
import CoreLocation

struct LotPolygon {
  let id: String
  let name: String
  let rings: [[CLLocationCoordinate2D]]
}

class DatabaseManager {
  static let shared = DatabaseManager()
  private var db: OpaquePointer?
  private var polygonCache: [LotPolygon] = []
  private let cacheQueue = DispatchQueue(label: "com.scarletspots.parkingmagic.polygoncache", attributes: .concurrent)
  private let dbQueue = DispatchQueue(label: "com.scarletspots.parkingmagic.dbqueue")
  private let schemaVersion = "2"
  private let dataVersion = "rutgers_parking_data_2026_04"

  init() {
    setupDatabase()
    
    // Phase 6: Thread Hardening
    // Hydration and polygon caching happen off-thread to prevent startup jank.
    DispatchQueue.global(qos: .userInitiated).async {
      self.hydrateDatabase()
      self.loadLotPolygons()
    }
  }

  private func setupDatabase() {
    dbQueue.sync {
      let fileManager = FileManager.default
      let urls = fileManager.urls(for: .documentDirectory, in: .userDomainMask)
      let dbPath = urls[0].appendingPathComponent("parking_lots.sqlite").path
      
      if sqlite3_open(dbPath, &db) != SQLITE_OK {
        print("[ParkingMagic] Error opening database")
        return
      }
      
      let createLotsQuery = "CREATE TABLE IF NOT EXISTS lots (id TEXT PRIMARY KEY, name TEXT, latitude REAL, longitude REAL, geometry TEXT);"
      if sqlite3_exec(db, createLotsQuery, nil, nil, nil) != SQLITE_OK {
        print("[ParkingMagic] Error creating table")
      }
      let createRingsQuery = """
      CREATE TABLE IF NOT EXISTS lot_rings (
        lot_id TEXT NOT NULL,
        ring_index INTEGER NOT NULL,
        PRIMARY KEY(lot_id, ring_index)
      );
      """
      _ = sqlite3_exec(db, createRingsQuery, nil, nil, nil)
      let createPointsQuery = """
      CREATE TABLE IF NOT EXISTS lot_points (
        lot_id TEXT NOT NULL,
        ring_index INTEGER NOT NULL,
        point_index INTEGER NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        PRIMARY KEY(lot_id, ring_index, point_index)
      );
      """
      _ = sqlite3_exec(db, createPointsQuery, nil, nil, nil)
      _ = sqlite3_exec(db, "CREATE INDEX IF NOT EXISTS idx_lot_points_lookup ON lot_points(lot_id, ring_index, point_index);", nil, nil, nil)
      _ = sqlite3_exec(db, "CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);", nil, nil, nil)
      _ = sqlite3_exec(db, "PRAGMA journal_mode=WAL;", nil, nil, nil)
      _ = sqlite3_exec(db, "PRAGMA synchronous=NORMAL;", nil, nil, nil)
      _ = sqlite3_exec(db, "PRAGMA temp_store=MEMORY;", nil, nil, nil)
    }
  }

  private func hydrateDatabase() {
    dbQueue.sync {
      guard db != nil else { return }
      var lotCount = 0
      var pointCount = 0
      var statement: OpaquePointer?
      if sqlite3_prepare_v2(db, "SELECT COUNT(*) FROM lots;", -1, &statement, nil) == SQLITE_OK {
        if sqlite3_step(statement) == SQLITE_ROW {
          lotCount = Int(sqlite3_column_int(statement, 0))
        }
      }
      sqlite3_finalize(statement)
      if sqlite3_prepare_v2(db, "SELECT COUNT(*) FROM lot_points;", -1, &statement, nil) == SQLITE_OK {
        if sqlite3_step(statement) == SQLITE_ROW {
          pointCount = Int(sqlite3_column_int(statement, 0))
        }
      }
      sqlite3_finalize(statement)

      let storedSchemaVersion = metadataValueUnsafe(key: "schema_version")
      let storedDataVersion = metadataValueUnsafe(key: "data_version")
      let versionsMatch =
        storedSchemaVersion == schemaVersion &&
        storedDataVersion == dataVersion

      if lotCount > 0 && pointCount > 0 && versionsMatch {
        print("[ParkingMagic] DB already hydrated with \(lotCount) lots and \(pointCount) points.")
        return
      }

      if lotCount > 0 && pointCount > 0 && !versionsMatch {
        print("[ParkingMagic] Data/schema version mismatch. Rehydrating database.")
        _ = sqlite3_exec(db, "DELETE FROM lot_points;", nil, nil, nil)
        _ = sqlite3_exec(db, "DELETE FROM lot_rings;", nil, nil, nil)
        _ = sqlite3_exec(db, "DELETE FROM lots;", nil, nil, nil)
      }

      if lotCount > 0 && pointCount == 0 {
        print("[ParkingMagic] Backfilling normalized polygon tables from legacy geometry...")
        if backfillNormalizedGeometryFromLegacy() {
          return
        }
        print("[ParkingMagic] Legacy backfill failed, rehydrating from bundled JSON.")
      }

      print("[ParkingMagic] Hydrating DB from JSON...")
      guard let path = Bundle.main.path(forResource: "rutgers_parking_data", ofType: "json"),
            let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
            let json = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
        print("[ParkingMagic] Failed to load hydration JSON.")
        return
      }
      sqlite3_exec(db, "BEGIN TRANSACTION;", nil, nil, nil)
      var hasInsertError = false
      _ = sqlite3_exec(db, "DELETE FROM lot_points;", nil, nil, nil)
      _ = sqlite3_exec(db, "DELETE FROM lot_rings;", nil, nil, nil)
      
      for lot in json {
        guard let id = lot["mapId"] as? String,
              let name = lot["propertyName"] as? String,
              let location = lot["location"] as? [String: Any],
              let lat = location["lat"] as? Double,
              let lng = location["lng"] as? Double else { continue }
        
        // We store the geometry as a JSON string for PIP fallback
        let geometryData = try? JSONSerialization.data(withJSONObject: lot["gtfsGeometry"] ?? [:])
        let geometryString = geometryData.flatMap { String(data: $0, encoding: .utf8) } ?? ""
        
        if !insertLotUnsafe(id: id, name: name, latitude: lat, longitude: lng, geometry: geometryString) {
          hasInsertError = true
          break
        }
        if let geometry = lot["gtfsGeometry"] as? [String: Any],
           let coords = geometry["coordinates"] as? [[[Double]]],
           !insertNormalizedGeometryUnsafe(lotId: id, rings: coords) {
          hasInsertError = true
          break
        }
      }
      
      if hasInsertError {
        sqlite3_exec(db, "ROLLBACK;", nil, nil, nil)
        print("[ParkingMagic] Hydration failed. Rolled back transaction.")
      } else {
        setMetadataValueUnsafe(key: "schema_version", value: schemaVersion)
        setMetadataValueUnsafe(key: "data_version", value: dataVersion)
        sqlite3_exec(db, "COMMIT;", nil, nil, nil)
        print("[ParkingMagic] Hydration complete.")
      }
    }
  }

  private func loadLotPolygons() {
    var cache: [LotPolygon] = []
    dbQueue.sync {
      guard db != nil else { return }
      // Load from normalized tables (no JSON parsing on hot path).
      let query = """
      SELECT l.id, l.name, p.ring_index, p.point_index, p.latitude, p.longitude
      FROM lots l
      JOIN lot_points p ON p.lot_id = l.id
      ORDER BY l.id ASC, p.ring_index ASC, p.point_index ASC;
      """
      var statement: OpaquePointer?
      var currentLotId: String?
      var currentLotName: String = ""
      var rings: [[CLLocationCoordinate2D]] = []
      var currentRingIndex: Int32 = -1
      
      if sqlite3_prepare_v2(db, query, -1, &statement, nil) == SQLITE_OK {
        while sqlite3_step(statement) == SQLITE_ROW {
          let id = String(cString: sqlite3_column_text(statement, 0))
          let name = String(cString: sqlite3_column_text(statement, 1))
          let ringIndex = sqlite3_column_int(statement, 2)
          let latitude = sqlite3_column_double(statement, 4)
          let longitude = sqlite3_column_double(statement, 5)

          if currentLotId != id {
            if let lotId = currentLotId, !rings.isEmpty {
              cache.append(LotPolygon(id: lotId, name: currentLotName, rings: rings))
            }
            currentLotId = id
            currentLotName = name
            rings = []
            currentRingIndex = -1
          }

          if ringIndex != currentRingIndex {
            rings.append([])
            currentRingIndex = ringIndex
          }

          if rings.isEmpty {
            rings.append([])
          }
          rings[rings.count - 1].append(CLLocationCoordinate2D(latitude: latitude, longitude: longitude))
        }
        if let lotId = currentLotId, !rings.isEmpty {
          cache.append(LotPolygon(id: lotId, name: currentLotName, rings: rings))
        }
      }
      sqlite3_finalize(statement)
    }

    if !cache.isEmpty {
      print("[DatabaseManager] Loaded \(cache.count) polygons from SQLite.")
      cacheQueue.async(flags: .barrier) {
        self.polygonCache = cache
      }
      return
    }

    // Fallback to JSON (only on first boot if SQL fails)
    guard let path = Bundle.main.path(forResource: "rutgers_parking_data", ofType: "json"),
          let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
          let json = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
      return
    }

    print("[DatabaseManager] Loading polygons from JSON fallback.")
    for lot in json {
      guard let id = lot["mapId"] as? String,
            let name = lot["propertyName"] as? String,
            let geometry = lot["gtfsGeometry"] as? [String: Any],
            let coords = geometry["coordinates"] as? [[[Double]]] else { continue }
      
      var rings: [[CLLocationCoordinate2D]] = []
      for ring in coords {
        rings.append(ring.map { CLLocationCoordinate2D(latitude: $0[1], longitude: $0[0]) })
      }
      cache.append(LotPolygon(id: id, name: name, rings: rings))
    }
    cacheQueue.async(flags: .barrier) {
      self.polygonCache = cache
    }
  }

  private func cachedPolygons() -> [LotPolygon] {
    cacheQueue.sync {
      polygonCache
    }
  }

  private func ensurePolygonCacheLoaded() {
    if !cachedPolygons().isEmpty {
      return
    }
    loadLotPolygons()
  }

  func getAllLotPolygons() -> [LotPolygon] {
    ensurePolygonCacheLoaded()
    return cachedPolygons()
  }

  func getLot(byId lotId: String) -> LotPolygon? {
    return getAllLotPolygons().first { $0.id == lotId }
  }

  func getLotAt(coordinate: CLLocationCoordinate2D) -> LotPolygon? {
    for lot in getAllLotPolygons() {
      for ring in lot.rings {
        if contains(coordinate, ring) {
          return lot
        }
      }
    }
    return nil
  }

  private func contains(_ point: CLLocationCoordinate2D, _ polygon: [CLLocationCoordinate2D]) -> Bool {
    guard polygon.count >= 3 else { return false }
    var contains = false
    var j = polygon.count - 1
    for i in 0..<polygon.count {
      if (polygon[i].longitude < point.longitude && polygon[j].longitude >= point.longitude ||
          polygon[j].longitude < point.longitude && polygon[i].longitude >= point.longitude) {
        if (polygon[i].latitude + (point.longitude - polygon[i].longitude) / (polygon[j].longitude - polygon[i].longitude) * (polygon[j].latitude - polygon[i].latitude) < point.latitude) {
          contains = !contains
        }
      }
      j = i
    }
    return contains
  }

  func insertLot(id: String, name: String, latitude: Double, longitude: Double, geometry: String) {
    dbQueue.sync {
      _ = insertLotUnsafe(id: id, name: name, latitude: latitude, longitude: longitude, geometry: geometry)
    }
  }

  private func insertLotUnsafe(id: String, name: String, latitude: Double, longitude: Double, geometry: String) -> Bool {
    guard db != nil else { return false }
    var statement: OpaquePointer?
    let query = "INSERT OR REPLACE INTO lots (id, name, latitude, longitude, geometry) VALUES (?, ?, ?, ?, ?);"
    
    if sqlite3_prepare_v2(db, query, -1, &statement, nil) == SQLITE_OK {
      sqlite3_bind_text(statement, 1, (id as NSString).utf8String, -1, nil)
      sqlite3_bind_text(statement, 2, (name as NSString).utf8String, -1, nil)
      sqlite3_bind_double(statement, 3, latitude)
      sqlite3_bind_double(statement, 4, longitude)
      sqlite3_bind_text(statement, 5, (geometry as NSString).utf8String, -1, nil)
      
      if sqlite3_step(statement) != SQLITE_DONE {
        print("Error inserting lot")
        sqlite3_finalize(statement)
        return false
      }
      sqlite3_finalize(statement)
      return true
    }
    sqlite3_finalize(statement)
    return false
  }

  private func insertNormalizedGeometryUnsafe(lotId: String, rings: [[[Double]]]) -> Bool {
    guard db != nil else { return false }
    var ringStmt: OpaquePointer?
    var pointStmt: OpaquePointer?
    let ringInsert = "INSERT OR REPLACE INTO lot_rings (lot_id, ring_index) VALUES (?, ?);"
    let pointInsert = """
    INSERT OR REPLACE INTO lot_points (lot_id, ring_index, point_index, latitude, longitude)
    VALUES (?, ?, ?, ?, ?);
    """
    guard sqlite3_prepare_v2(db, ringInsert, -1, &ringStmt, nil) == SQLITE_OK,
          sqlite3_prepare_v2(db, pointInsert, -1, &pointStmt, nil) == SQLITE_OK else {
      sqlite3_finalize(ringStmt)
      sqlite3_finalize(pointStmt)
      return false
    }

    for (ringIdx, ring) in rings.enumerated() {
      sqlite3_reset(ringStmt)
      sqlite3_clear_bindings(ringStmt)
      sqlite3_bind_text(ringStmt, 1, (lotId as NSString).utf8String, -1, nil)
      sqlite3_bind_int(ringStmt, 2, Int32(ringIdx))
      if sqlite3_step(ringStmt) != SQLITE_DONE {
        sqlite3_finalize(ringStmt)
        sqlite3_finalize(pointStmt)
        return false
      }

      for (pointIdx, point) in ring.enumerated() {
        if point.count < 2 { continue }
        sqlite3_reset(pointStmt)
        sqlite3_clear_bindings(pointStmt)
        sqlite3_bind_text(pointStmt, 1, (lotId as NSString).utf8String, -1, nil)
        sqlite3_bind_int(pointStmt, 2, Int32(ringIdx))
        sqlite3_bind_int(pointStmt, 3, Int32(pointIdx))
        sqlite3_bind_double(pointStmt, 4, point[1])
        sqlite3_bind_double(pointStmt, 5, point[0])
        if sqlite3_step(pointStmt) != SQLITE_DONE {
          sqlite3_finalize(ringStmt)
          sqlite3_finalize(pointStmt)
          return false
        }
      }
    }

    sqlite3_finalize(ringStmt)
    sqlite3_finalize(pointStmt)
    return true
  }

  private func backfillNormalizedGeometryFromLegacy() -> Bool {
    guard db != nil else { return false }
    var statement: OpaquePointer?
    let query = "SELECT id, geometry FROM lots WHERE geometry IS NOT NULL AND length(geometry) > 0;"
    guard sqlite3_prepare_v2(db, query, -1, &statement, nil) == SQLITE_OK else {
      return false
    }

    sqlite3_exec(db, "BEGIN TRANSACTION;", nil, nil, nil)
    _ = sqlite3_exec(db, "DELETE FROM lot_points;", nil, nil, nil)
    _ = sqlite3_exec(db, "DELETE FROM lot_rings;", nil, nil, nil)
    var ok = true

    while sqlite3_step(statement) == SQLITE_ROW {
      let id = String(cString: sqlite3_column_text(statement, 0))
      let geometryString = String(cString: sqlite3_column_text(statement, 1))
      if let data = geometryString.data(using: .utf8),
         let geometry = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
         let coords = geometry["coordinates"] as? [[[Double]]] {
        if !insertNormalizedGeometryUnsafe(lotId: id, rings: coords) {
          ok = false
          break
        }
      }
    }
    sqlite3_finalize(statement)

    if ok {
      setMetadataValueUnsafe(key: "schema_version", value: schemaVersion)
      setMetadataValueUnsafe(key: "data_version", value: dataVersion)
      sqlite3_exec(db, "COMMIT;", nil, nil, nil)
      print("[ParkingMagic] Normalized geometry backfill complete.")
      return true
    }

    sqlite3_exec(db, "ROLLBACK;", nil, nil, nil)
    return false
  }

  private func metadataValueUnsafe(key: String) -> String? {
    guard db != nil else { return nil }
    let query = "SELECT value FROM metadata WHERE key = ?;"
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(db, query, -1, &statement, nil) == SQLITE_OK else {
      sqlite3_finalize(statement)
      return nil
    }
    sqlite3_bind_text(statement, 1, (key as NSString).utf8String, -1, nil)
    let value: String?
    if sqlite3_step(statement) == SQLITE_ROW, let cString = sqlite3_column_text(statement, 0) {
      value = String(cString: cString)
    } else {
      value = nil
    }
    sqlite3_finalize(statement)
    return value
  }

  private func setMetadataValueUnsafe(key: String, value: String) {
    guard db != nil else { return }
    let query = """
    INSERT INTO metadata (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    """
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(db, query, -1, &statement, nil) == SQLITE_OK else {
      sqlite3_finalize(statement)
      return
    }
    sqlite3_bind_text(statement, 1, (key as NSString).utf8String, -1, nil)
    sqlite3_bind_text(statement, 2, (value as NSString).utf8String, -1, nil)
    _ = sqlite3_step(statement)
    sqlite3_finalize(statement)
  }
}
