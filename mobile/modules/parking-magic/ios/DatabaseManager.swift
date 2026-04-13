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

  init() {
    setupDatabase()
    loadLotPolygons()
  }

  private func setupDatabase() {
    let fileManager = FileManager.default
    let urls = fileManager.urls(for: .documentDirectory, in: .userDomainMask)
    let dbPath = urls[0].appendingPathComponent("parking_lots.sqlite").path
    
    if sqlite3_open(dbPath, &db) != SQLITE_OK {
      print("Error opening database")
      return
    }
    
    let createTableQuery = "CREATE TABLE IF NOT EXISTS lots (id TEXT PRIMARY KEY, name TEXT, latitude REAL, longitude REAL, geometry TEXT);"
    if sqlite3_exec(db, createTableQuery, nil, nil, nil) != SQLITE_OK {
      print("Error creating table")
    }
  }

  private func loadLotPolygons() {
    // Load from bundled resource
    guard let path = Bundle.main.path(forResource: "rutgers_parking_data", ofType: "json"),
          let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
          let json = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
      return
    }

    var cache: [LotPolygon] = []
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
    self.polygonCache = cache
  }

  func getLotAt(coordinate: CLLocationCoordinate2D) -> LotPolygon? {
    for lot in polygonCache {
      for ring in lot.rings {
        if contains(coordinate, ring) {
          return lot
        }
      }
    }
    return nil
  }

  private func contains(_ point: CLLocationCoordinate2D, _ polygon: [CLLocationCoordinate2D]) -> Bool {
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
