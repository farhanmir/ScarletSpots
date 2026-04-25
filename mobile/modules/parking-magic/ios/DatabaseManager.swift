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
    let fileManager = FileManager.default
    let urls = fileManager.urls(for: .documentDirectory, in: .userDomainMask)
    let dbPath = urls[0].appendingPathComponent("parking_lots.sqlite").path
    
    if sqlite3_open(dbPath, &db) != SQLITE_OK {
      print("[ParkingMagic] Error opening database")
      return
    }
    
    let createTableQuery = "CREATE TABLE IF NOT EXISTS lots (id TEXT PRIMARY KEY, name TEXT, latitude REAL, longitude REAL, geometry TEXT);"
    if sqlite3_exec(db, createTableQuery, nil, nil, nil) != SQLITE_OK {
      print("[ParkingMagic] Error creating table")
    }
  }

  private func hydrateDatabase() {
    // Check if already hydrated
    var count: Int = 0
    let countQuery = "SELECT COUNT(*) FROM lots;"
    var statement: OpaquePointer?
    if sqlite3_prepare_v2(db, countQuery, -1, &statement, nil) == SQLITE_OK {
      if sqlite3_step(statement) == SQLITE_ROW {
        count = Int(sqlite3_column_int(statement, 0))
      }
    }
    sqlite3_finalize(statement)

    if count > 0 {
      print("[ParkingMagic] DB already hydrated with \(count) lots.")
      return
    }

    print("[ParkingMagic] Hydrating DB from JSON...")
    
    guard let path = Bundle.main.path(forResource: "rutgers_parking_data", ofType: "json"),
          let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
          let json = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
      print("[ParkingMagic] Failed to load hydration JSON.")
      return
    }

    sqlite3_exec(db, "BEGIN TRANSACTION;", nil, nil, nil)
    
    for lot in json {
      guard let id = lot["mapId"] as? String,
            let name = lot["propertyName"] as? String,
            let location = lot["location"] as? [String: Any],
            let lat = location["lat"] as? Double,
            let lng = location["lng"] as? Double else { continue }
      
      // We store the geometry as a JSON string for PIP fallback
      let geometryData = try? JSONSerialization.data(withJSONObject: lot["gtfsGeometry"] ?? [:])
      let geometryString = geometryData.flatMap { String(data: $0, encoding: .utf8) } ?? ""
      
      insertLot(id: id, name: name, latitude: lat, longitude: lng, geometry: geometryString)
    }

    sqlite3_exec(db, "COMMIT;", nil, nil, nil)
    print("[ParkingMagic] Hydration complete.")
  }

  private func loadLotPolygons() {
    var cache: [LotPolygon] = []
    
    // Attempt to load from SQLite first
    let query = "SELECT id, name, geometry FROM lots;"
    var statement: OpaquePointer?
    
    if sqlite3_prepare_v2(db, query, -1, &statement, nil) == SQLITE_OK {
      while sqlite3_step(statement) == SQLITE_ROW {
        let id = String(cString: sqlite3_column_text(statement, 0))
        let name = String(cString: sqlite3_column_text(statement, 1))
        let geometryString = String(cString: sqlite3_column_text(statement, 2))
        
        if let data = geometryString.data(using: .utf8),
           let points = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["coordinates"] as? [[[Double]]] {
          var rings: [[CLLocationCoordinate2D]] = []
          for ring in points {
            rings.append(ring.map { CLLocationCoordinate2D(latitude: $0[1], longitude: $0[0]) })
          }
          cache.append(LotPolygon(id: id, name: name, rings: rings))
        }
      }
    }
    sqlite3_finalize(statement)

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
      }
    }
    sqlite3_finalize(statement)
  }
}
