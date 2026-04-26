import SwiftUI
import MapKit
import CoreLocation

/// Primary map screen.
///
/// Responsibilities:
/// - Renders the New Brunswick parking-lot polygons, colored by live
///   occupancy from the websocket / poller.
/// - Applies the user's permit + campus filters so they never see lots they
///   can't park in.
/// - Surfaces the active parking session (bottom chip) and auto-park
///   candidates (pulse pin + confirmation sheet).
/// - Honors a "focus" search intent so tapping a result in Search jumps the
///   camera to that lot.
struct MapView: View {
    @EnvironmentObject private var tabBarState: TabBarState
    @Namespace private var mapScope
    @StateObject private var sessionStore = NativeSessionStore.shared
    @StateObject private var lotRepository = LotRepository.shared
    @StateObject private var permitRepository = PermitRepository.shared
    @StateObject private var autoPark = AutoParkCoordinator.shared
    @StateObject private var webSocket = WebSocketManager.shared
    @StateObject private var auth = AuthManager.shared
    @StateObject private var location = LocationEngine.shared

    @State private var selectedLot: Lot?
    @State private var favoriteIds: Set<String> = []
    @State private var showCandidateSheet = false

    @State private var zoomDistance: Double = 9000
    @State private var position: MapCameraPosition = .camera(
        MapCamera(
            centerCoordinate: CLLocationCoordinate2D(latitude: 40.5014, longitude: -74.4474),
            distance: 9000
        )
    )
    private let distanceFormatter: MeasurementFormatter = {
        let formatter = MeasurementFormatter()
        formatter.unitOptions = .naturalScale
        formatter.unitStyle = .short
        formatter.numberFormatter.maximumFractionDigits = 1
        return formatter
    }()

    var body: some View {
        ZStack(alignment: .bottom) {
            Map(position: $position, scope: mapScope) {
                if zoomLevel == .lot {
                    ForEach(polygonItems) { item in
                        polygonShape(for: item)
                    }
                    ForEach(visibleLots) { lot in
                        Annotation("", coordinate: lot.location.clLocationCoordinate2D) {
                            Button { selectedLot = lot } label: {
                                lotBadge(for: lot)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(accessibilityText(for: lot))
                            .accessibilityHint("Opens details for \(lot.shortName).")
                        }
                    }
                } else {
                    ForEach(clusters) { cluster in
                        Annotation("", coordinate: cluster.coordinate) {
                            Button { zoomInTo(cluster: cluster) } label: {
                                clusterBadge(for: cluster)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("\(cluster.name), \(Int(cluster.occupancyRate.rounded())) percent occupied")
                            .accessibilityHint("Zooms into \(cluster.name).")
                        }
                    }
                }
                ForEach(autoPark.pendingCandidates) { candidate in
                    Annotation("", coordinate: CLLocationCoordinate2D(latitude: candidate.latitude, longitude: candidate.longitude)) {
                        CandidatePin(candidate: candidate)
                            .onTapGesture { showCandidateSheet = true }
                    }
                }
                UserAnnotation()
            }
            .mapStyle(.standard(elevation: .realistic))
            .tint(.blue) // Native blue for user location dot
            .mapControls {
                MapCompass(scope: mapScope)
                MapScaleView(scope: mapScope)
            }
            .onMapCameraChange(frequency: .onEnd) { context in
                zoomDistance = context.camera.distance
            }

            VStack(spacing: 12) {
                if let session = sessionStore.activeSession {
                    ActiveSessionChip(session: session)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
                if let distance = findCarDistanceText {
                    findCarChip(distance: distance)
                }
            }
            .padding(.bottom, 22)
            .animation(.easeInOut(duration: 0.2), value: sessionStore.activeSession?.id)
        }
        .overlay(alignment: .bottomTrailing) {
            MapUserLocationButton(scope: mapScope)
                .labelStyle(.iconOnly)
                .padding(8)
                .background(.ultraThinMaterial, in: Circle())
                .overlay {
                    Circle().stroke(.white.opacity(0.20), lineWidth: 1)
                }
                .shadow(color: .black.opacity(0.18), radius: 8, y: 4)
            .padding(.trailing, 16)
            .padding(.bottom, 24)
        }
        .sheet(item: $selectedLot) { lot in
            LotDetailsSheet(lot: lot, favoriteIds: $favoriteIds)
                .presentationDetents([.large])
        }
        .sheet(isPresented: $showCandidateSheet) {
            ParkingConfirmationSheet(
                candidates: autoPark.pendingCandidates,
                onConfirm: { candidate in
                    Task { await autoPark.confirm(candidate) }
                    showCandidateSheet = false
                },
                onDismiss: {
                    autoPark.dismissCandidates()
                    showCandidateSheet = false
                }
            )
            .presentationDetents([.medium])
        }
        .onChange(of: autoPark.pendingCandidates.count) { _, newValue in
            showCandidateSheet = newValue > 0
        }
        .onChange(of: tabBarState.focusLotId) { _, newValue in
            if let id = newValue, let lot = lotRepository.byId(id) {
                focus(on: lot)
                tabBarState.focusLotId = nil
            }
        }
        .onChange(of: tabBarState.focusCoordinate) { _, newValue in
            if let target = newValue {
                focus(on: CLLocationCoordinate2D(latitude: target.latitude, longitude: target.longitude))
                tabBarState.focusCoordinate = nil
            }
        }
        .task {
            WebSocketManager.shared.connect()
            await sessionStore.refresh()
            if let favorites = try? await FavoritesAPI.list() {
                favoriteIds = Set(favorites)
            }
        }
    }

    // MARK: - Computed subviews


    @ViewBuilder
    private func lotBadge(for lot: Lot) -> some View {
        let occupancy = webSocket.lotOccupancies[lot.mapId] ?? 0
        let capacity = max(lot.totalSpaces, 1)
        let ratio = Double(occupancy) / Double(capacity)
        let percent = Int((ratio * 100).rounded())
        let label = "\(percent)%"

        MapPin(label: label, color: colorForLot(lot))
    }

    @ViewBuilder
    private func clusterBadge(for cluster: LotCluster) -> some View {
        let percent = Int(cluster.occupancyRate.rounded())
        MapPin(
            label: "\(cluster.name): \(percent)%",
            color: OccupancyPalette.clusterColor(for: cluster.occupancyRate)
        )
    }

    private func findCarChip(distance: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "car.fill")
                .foregroundStyle(.white)
            Text("\(distance) to car")
                .font(.callout.weight(.semibold))
                .foregroundStyle(.white)
            Button {
                if let session = sessionStore.activeSession, let lot = lotRepository.byId(session.lotId) {
                    focus(on: lot)
                }
            } label: {
                Text("Find")
                    .font(.caption.bold())
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(.white.opacity(0.2), in: Capsule())
                    .foregroundStyle(.white)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color.red.gradient, in: Capsule())
    }

    // MARK: - Data

    private struct PolygonItem: Identifiable {
        let id: String
        let lotId: String
        let coordinates: [CLLocationCoordinate2D]
        let color: Color
    }

    /// Pre-flattened polygon list so the `Map` content builder only has to
    /// iterate a single `ForEach`. Keeps the API straightforward and dodges
    /// the "too many outputs" compile-time issue that nested ForEach can hit
    /// inside `MapContentBuilder`.
    private var polygonItems: [PolygonItem] {
        visibleLots.flatMap { lot in
            let color = colorForLot(lot)
            return lot.polygons.enumerated().map { index, ring in
                PolygonItem(
                    id: "\(lot.mapId)#\(index)",
                    lotId: lot.mapId,
                    coordinates: cleanedPolygonCoordinates(ring.outer),
                    color: color
                )
            }
        }
    }

    private var visibleLots: [Lot] {
        let campusFiltered = lotRepository.byCampus(auth.enabledCampuses)
        if let mode = auth.noPermitMode {
            return permitRepository.filtered(
                lots: campusFiltered,
                primary: mode,
                secondary: nil
            )
        }
        return permitRepository.filtered(
            lots: campusFiltered,
            primary: auth.permitType,
            secondary: auth.secondaryPermitType
        )
    }

    private var findCarDistanceText: String? {
        guard let session = sessionStore.activeSession else { return nil }
        guard let sessionLat = session.latitude,
              let sessionLng = session.longitude,
              let current = location.latestLocation else { return nil }
        let to = CLLocation(latitude: sessionLat, longitude: sessionLng)
        let meters = current.distance(from: to)
        return formatDistance(meters: meters)
    }

    private func accessibilityText(for lot: Lot) -> String {
        let occupancy = webSocket.lotOccupancies[lot.mapId] ?? 0
        let row = webSocket.lotOccupancyRows[lot.mapId]
        let sourceLabel = (row?.source ?? "") == "realtime" ? "realtime" : "estimated"
        let capacity = max(lot.totalSpaces, 1)
        let freeSpots = max(capacity - occupancy, 0)
        return "\(lot.shortName), \(freeSpots) spots free out of \(capacity), \(sourceLabel)."
    }

    private func colorForLot(_ lot: Lot) -> Color {
        let occupancy = webSocket.lotOccupancies[lot.mapId] ?? 0
        let capacity = max(lot.totalSpaces, 1)
        let ratio = Double(occupancy) / Double(capacity)
        return OccupancyPalette.color(forRatio: ratio)
    }

    // MARK: - Clustering

    private enum ZoomLevel { case lot, campus, hidden }

    /// Map camera distance buckets that mirror the React Native zoom logic:
    ///   `latitudeDelta < 0.05` → individual lot pills
    ///   `latitudeDelta < 0.6`  → one cluster per campus
    ///   else                   → single regional cluster
    /// Converted to MapKit camera distances (rough equivalents, tunable).
    private var zoomLevel: ZoomLevel {
        if zoomDistance < 6_000 { return .lot }
        if zoomDistance < 55_000 { return .campus }
        return .hidden
    }

    private struct LotCluster: Identifiable {
        enum Kind { case campus, region }
        let id: String
        let kind: Kind
        let name: String
        let coordinate: CLLocationCoordinate2D
        let occupancyRate: Double
        let count: Int
    }

    /// Aggregated lot pills used at non-`.lot` zoom levels. Mirrors the
    /// `clusters` memo in `mobile/src/features/home/screens/HomeScreen.tsx`.
    private var clusters: [LotCluster] {
        guard zoomLevel != .lot else { return [] }
        let lots = visibleLots
        guard !lots.isEmpty else { return [] }

        if zoomLevel == .hidden {
            let avgOccupancy = lots.reduce(0.0) { $0 + occupancyRate(for: $1) } / Double(lots.count)
            return [
                LotCluster(
                    id: "region:rutgers",
                    kind: .region,
                    name: "Rutgers University",
                    coordinate: CLLocationCoordinate2D(latitude: 40.5008, longitude: -74.4474),
                    occupancyRate: avgOccupancy,
                    count: lots.count
                )
            ]
        }

        struct Bucket { var latSum: Double = 0; var lngSum: Double = 0; var occSum: Double = 0; var count: Int = 0 }
        var buckets: [String: Bucket] = [:]
        for lot in lots {
            let key = lot.address.campus ?? "Other"
            var bucket = buckets[key] ?? Bucket()
            bucket.latSum += lot.location.lat
            bucket.lngSum += lot.location.lng
            bucket.occSum += occupancyRate(for: lot)
            bucket.count += 1
            buckets[key] = bucket
        }

        return buckets.map { name, bucket in
            let n = max(bucket.count, 1)
            return LotCluster(
                id: "campus:\(name)",
                kind: .campus,
                name: name,
                coordinate: CLLocationCoordinate2D(
                    latitude: bucket.latSum / Double(n),
                    longitude: bucket.lngSum / Double(n)
                ),
                occupancyRate: bucket.occSum / Double(n),
                count: bucket.count
            )
        }
        .sorted { $0.id < $1.id }
    }

    private func occupancyRate(for lot: Lot) -> Double {
        let occupancy = webSocket.lotOccupancies[lot.mapId] ?? 0
        let capacity = max(lot.totalSpaces, 1)
        return min(100, Double(occupancy) / Double(capacity) * 100)
    }

    private func zoomInTo(cluster: LotCluster) {
        withAnimation(.easeInOut(duration: 0.4)) {
            position = .camera(
                MapCamera(
                    centerCoordinate: cluster.coordinate,
                    distance: cluster.kind == .region ? 9_000 : 3_500
                )
            )
        }
    }

    /// Normalizes raw lot rings before rendering in `MapPolygon`.
    ///
    /// Some source polygons (notably Public Safety Deck / Lot 70) contain
    /// ultra-short zig-zag segments that look like sharp spikes at low zoom.
    /// We preserve overall shape while stripping those tiny needles:
    /// - drop near-duplicate points (< 0.35m from previous)
    /// - collapse "needle" points where adjacent segments are tiny and the
    ///   path immediately returns near the previous point.
    private func cleanedPolygonCoordinates(_ input: [CLLocationCoordinate2D]) -> [CLLocationCoordinate2D] {
        guard input.count > 4 else { return input }

        var points: [CLLocationCoordinate2D] = []
        points.reserveCapacity(input.count)
        for point in input {
            if let last = points.last, metersBetween(last, point) < 0.35 {
                continue
            }
            points.append(point)
        }

        guard points.count > 4 else { return input }
        var cleaned: [CLLocationCoordinate2D] = []
        cleaned.reserveCapacity(points.count)
        cleaned.append(points[0])

        for idx in 1..<(points.count - 1) {
            let prev = cleaned.last ?? points[idx - 1]
            let current = points[idx]
            let next = points[idx + 1]
            let a = metersBetween(prev, current)
            let b = metersBetween(current, next)
            let c = metersBetween(prev, next)

            let looksLikeNeedle = a < 6.0 && b < 6.0 && c < 3.0
            if looksLikeNeedle {
                continue
            }
            cleaned.append(current)
        }
        if let last = points.last {
            cleaned.append(last)
        }

        return cleaned.count >= 3 ? cleaned : points
    }

    private func metersBetween(_ a: CLLocationCoordinate2D, _ b: CLLocationCoordinate2D) -> CLLocationDistance {
        CLLocation(latitude: a.latitude, longitude: a.longitude)
            .distance(from: CLLocation(latitude: b.latitude, longitude: b.longitude))
    }

    private func formatDistance(meters: Double) -> String {
        distanceFormatter.string(from: Measurement(value: meters, unit: UnitLength.meters))
    }

    @MapContentBuilder
    private func polygonShape(for item: PolygonItem) -> some MapContent {
        let fill = item.color.opacity(0.60)
        let stroke = item.color.opacity(0.9)
        MapPolygon(coordinates: item.coordinates)
            .foregroundStyle(fill)
            .stroke(stroke, lineWidth: 2.0)
    }

    private func focus(on lot: Lot) {
        withAnimation(.easeInOut(duration: 0.4)) {
            position = .camera(
                MapCamera(
                    centerCoordinate: lot.location.clLocationCoordinate2D,
                    distance: 1200
                )
            )
        }
        selectedLot = lot
    }

    private func focus(on coordinate: CLLocationCoordinate2D) {
        withAnimation(.easeInOut(duration: 0.4)) {
            position = .camera(MapCamera(centerCoordinate: coordinate, distance: 1500))
        }
    }
}

// MARK: - Map pin

/// Bubble + downward-pointing triangle marker shared by per-lot pins and
/// cluster pins. Mirrors the `markerBubble` + `markerArrow` styles in
/// `mobile/src/features/home/screens/HomeScreen.tsx`:
///   - 12pt corner radius, 8/4 padding, 40pt minimum width
///   - 12pt bold white label
///   - tinted drop shadow for depth
///   - 12x8 triangle "tail" sitting flush below the bubble
private struct MapPin: View {
    let label: String
    let color: Color

    var body: some View {
        VStack(spacing: 0) {
            Text(label)
                .font(.system(size: 12, weight: .bold).monospacedDigit())
                .foregroundStyle(.white)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .frame(minWidth: 40)
                .background(
                    color,
                    in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                )

            DownTriangle()
                .fill(color)
                .frame(width: 12, height: 8)
                .offset(y: -1) // overlap bubble seam, mirrors RN translateY: -1
        }
        .shadow(color: color.opacity(0.38), radius: 5, y: 2)
    }
}

private struct DownTriangle: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: 0, y: 0))
        path.addLine(to: CGPoint(x: rect.maxX, y: 0))
        path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}
