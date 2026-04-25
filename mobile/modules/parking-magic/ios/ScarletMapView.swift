import ExpoModulesCore
import MapKit

class ScarletMapView: ExpoView, MKMapViewDelegate {
  let mapView = MKMapView()
  let onLotPress = EventDispatcher()
  private var selectedLotId: String? = nil
  private var polygonsByLotId: [String: [MKPolygon]] = [:]

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    mapView.delegate = self
    mapView.showsUserLocation = true
    mapView.register(MKMarkerAnnotationView.self, forAnnotationViewWithReuseIdentifier: MKMapViewDefaultAnnotationViewReuseIdentifier)
    addSubview(mapView)

    let tap = UITapGestureRecognizer(target: self, action: #selector(handleMapTap(_:)))
    tap.cancelsTouchesInView = false
    mapView.addGestureRecognizer(tap)
    
    // Initial camera position (Rutgers New Brunswick)
    let initialRegion = MKCoordinateRegion(
      center: CLLocationCoordinate2D(latitude: 40.5230, longitude: -74.4580),
      span: MKCoordinateSpan(latitudeDelta: 0.1, longitudeDelta: 0.1)
    )
    mapView.setRegion(initialRegion, animated: false)
    
    loadLots()
  }

  private func loadLots() {
    polygonsByLotId.removeAll()
    mapView.removeOverlays(mapView.overlays)

    for lot in DatabaseManager.shared.getAllLotPolygons() {
      for ring in lot.rings where ring.count >= 3 {
        let polygon = MKPolygon(coordinates: ring, count: ring.count)
        polygon.title = lot.id
        polygonsByLotId[lot.id, default: []].append(polygon)
        mapView.addOverlay(polygon)
      }
    }
  }

  override func layoutSubviews() {
    mapView.frame = bounds
  }

  func setSelectedLot(_ lotId: String?) {
    self.selectedLotId = lotId
    for polygon in mapView.overlays.compactMap({ $0 as? MKPolygon }) {
      if let renderer = mapView.renderer(for: polygon) as? MKPolygonRenderer {
        styleRenderer(renderer, for: polygon)
      }
    }
  }

  @objc private func handleMapTap(_ gesture: UITapGestureRecognizer) {
    let point = gesture.location(in: mapView)
    let coordinate = mapView.convert(point, toCoordinateFrom: mapView)

    if let lot = DatabaseManager.shared.getLotAt(coordinate: coordinate) {
      selectedLotId = lot.id
      setSelectedLot(lot.id)
      onLotPress([
        "lotId": lot.id,
        "lotName": lot.name
      ])
    }
  }

  private func styleRenderer(_ renderer: MKPolygonRenderer, for polygon: MKPolygon) {
    let lotId = polygon.title ?? nil
    let isSelected = lotId != nil && lotId == selectedLotId

    if isSelected {
      renderer.fillColor = UIColor.systemBlue.withAlphaComponent(0.35)
      renderer.strokeColor = UIColor.systemBlue
      renderer.lineWidth = 2
    } else {
      renderer.fillColor = UIColor.systemRed.withAlphaComponent(0.2)
      renderer.strokeColor = UIColor.systemRed.withAlphaComponent(0.8)
      renderer.lineWidth = 1
    }
  }

  // MARK: - MKMapViewDelegate
  
  func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
    if let polygon = overlay as? MKPolygon {
      let renderer = MKPolygonRenderer(polygon: polygon)
      styleRenderer(renderer, for: polygon)
      return renderer
    }
    return MKOverlayRenderer(overlay: overlay)
  }
}
