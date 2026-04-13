import ExpoModulesCore
import MapKit

class ScarletMapView: ExpoView, MKMapViewDelegate {
  let mapView = MKMapView()
  let onLotPress = EventDispatcher()
  private var selectedLotId: String? = nil

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    mapView.delegate = self
    mapView.showsUserLocation = true
    mapView.register(MKMarkerAnnotationView.self, forAnnotationViewWithIdentifier: MKMapViewDefaultAnnotationViewReuseIdentifier)
    addSubview(mapView)
    
    // Initial camera position (Rutgers New Brunswick)
    let initialRegion = MKCoordinateRegion(
      center: CLLocationCoordinate2D(latitude: 40.5230, longitude: -74.4580),
      span: MKCoordinateSpan(latitudeDelta: 0.1, longitudeDelta: 0.1)
    )
    mapView.setRegion(initialRegion, animated: false)
    
    loadLots()
  }

  private func loadLots() {
    // In a real build, we'd ensure this JSON is in the Bundle.
    // For now, I'll implement the logic to parse and add overlays.
    guard let path = Bundle.main.path(forResource: "rutgers_parking_data", ofType: "json"),
          let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
          let json = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
      return
    }

    for lot in json {
      guard let geometry = lot["gtfsGeometry"] as? [String: Any],
            let coordinates = geometry["coordinates"] as? [[[Double]]] else { continue }
      
      for ring in coordinates {
        var points: [CLLocationCoordinate2D] = []
        for point in ring {
          if point.count >= 2 {
            points.append(CLLocationCoordinate2D(latitude: point[1], longitude: point[0]))
          }
        }
        let polygon = MKPolygon(coordinates: points, count: points.count)
        polygon.title = lot["mapId"] as? String
        mapView.addOverlay(polygon)
      }
    }
  }

  override func layoutSubviews() {
    mapView.frame = bounds
  }

  func setSelectedLot(_ lotId: String?) {
    self.selectedLotId = lotId
    // TODO: Update polygon highlights
  }

  // MARK: - MKMapViewDelegate
  
  func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
    if let polygon = overlay as? MKPolygon {
      let renderer = MKPolygonRenderer(polygon: polygon)
      renderer.fillColor = UIColor.systemRed.withAlphaComponent(0.3)
      renderer.strokeColor = UIColor.systemRed
      renderer.lineWidth = 1
      return renderer
    }
    return MKOverlayRenderer(overlay: overlay)
  }
}
