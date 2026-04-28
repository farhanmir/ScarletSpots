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
///   camera to that lot or drops a temporary destination pin.
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
    @State private var selectedDestination: TabBarState.FocusDestination?
    @State private var temporarilyPreviewedLot: Lot?
    @State private var favoriteIds: Set<String> = []
    @State private var showCandidateSheet = false
    @State private var centerAlert: String?

    @State private var zoomDistance: Double = 9000
    @State private var position: MapCameraPosition = .camera(
        MapCamera(
            centerCoordinate: CLLocationCoordinate2D(latitude: 40.5014, longitude: -74.4474),
            distance: 9000
        )
    )

    private let lotTapSnapRadiusMeters: CLLocationDistance = 110

    var body: some View {
        MapReader { proxy in
            ZStack(alignment: .bottom) {
                mapBody(proxy: proxy)

                VStack(spacing: 12) {
                    if let session = sessionStore.activeSession {
                        ActiveSessionChip(session: session)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
                .padding(.bottom, 22)
                .animation(.easeInOut(duration: 0.2), value: sessionStore.activeSession?.id)
            }
        }
        .overlay(alignment: .bottomTrailing) {
            goToMeButton
                .padding(.trailing, 16)
                .padding(.bottom, sessionStore.activeSession == nil ? 24 : 96)
        }
        .sheet(item: $selectedLot) { lot in
            LotDetailsSheet(lot: lot, favoriteIds: $favoriteIds)
                .presentationDetents([.large])
                .presentationCornerRadius(30)
                .presentationBackground {
                    if #available(iOS 26.0, *) {
                        Rectangle()
                            .fill(.clear)
                            .glassEffect(
                                .regular,
                                in: RoundedRectangle(cornerRadius: 30, style: .continuous)
                            )
                            .ignoresSafeArea()
                    } else {
                        Rectangle()
                            .fill(.ultraThinMaterial)
                            .ignoresSafeArea()
                    }
                }
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
        .onChange(of: selectedLot) { _, newValue in
            if newValue == nil {
                temporarilyPreviewedLot = nil
            }
        }
        .onChange(of: tabBarState.focusLotId) { _, newValue in
            if let id = newValue, let lot = lotRepository.byId(id) {
                selectedDestination = nil
                focus(on: lot)
                tabBarState.focusLotId = nil
            }
        }
        .onChange(of: tabBarState.focusDestination) { _, newValue in
            if let target = newValue {
                selectedLot = nil
                selectedDestination = target
                focus(on: CLLocationCoordinate2D(latitude: target.latitude, longitude: target.longitude))
                tabBarState.focusDestination = nil
            }
        }
        .onChange(of: selectedDestination) { _, newValue in
            guard let target = newValue else { return }
            Task { @MainActor in
                let remaining = target.expiresAt.timeIntervalSinceNow
                guard remaining > 0 else {
                    clearDestination(ifMatching: target)
                    return
                }
                try? await Task.sleep(nanoseconds: UInt64(remaining * 1_000_000_000))
                clearDestination(ifMatching: target)
            }
        }
        .onChange(of: location.authorization) { _, _ in
            if location.hasForegroundPermission {
                location.start()
                location.requestCurrentLocation()
            }
        }
        .task {
            WebSocketManager.shared.connect()
            await sessionStore.refresh()
            if let favorites = try? await FavoritesAPI.list() {
                favoriteIds = Set(favorites)
            }
            if location.hasForegroundPermission {
                location.start()
                location.requestCurrentLocation()
            }
        }
        .alert("Location Unavailable", isPresented: Binding(
            get: { centerAlert != nil },
            set: { if !$0 { centerAlert = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(centerAlert ?? "")
        }
    }

    @ViewBuilder
    private func mapBody(proxy: MapProxy) -> some View {
        Map(position: $position, scope: mapScope) {
            if zoomLevel == .lot {
                ForEach(polygonItems) { item in
                    polygonShape(for: item)
                }
                ForEach(visibleLots) { lot in
                    Annotation("", coordinate: lot.location.clLocationCoordinate2D) {
                        Button {
                            HapticManager.shared.selection()
                            selectedDestination = nil
                            selectedLot = lot
                        } label: {
                            lotBadge(for: lot)
                                .padding(18)
                                .contentShape(Rectangle())
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

            if let selectedDestination {
                Annotation("", coordinate: CLLocationCoordinate2D(
                    latitude: selectedDestination.latitude,
                    longitude: selectedDestination.longitude
                )) {
                    DestinationPin(title: selectedDestination.title)
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
        .tint(.blue)
        .mapControls {
            MapCompass(scope: mapScope)
        }
        .onMapCameraChange(frequency: .onEnd) { context in
            zoomDistance = context.camera.distance
        }
        .gesture(
            SpatialTapGesture()
                .onEnded { value in
                    guard let coordinate = proxy.convert(value.location, from: .local) else { return }
                    handleMapTap(at: coordinate)
                }
        )
    }

    private var goToMeButton: some View {
        Button {
            HapticManager.shared.softImpact()
            Task { await handleCenterOnUser() }
        } label: {
            Image(systemName: "location.north.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.white.opacity(0.95))
                .frame(width: 42, height: 42)
                .liquidGlassCircle()
                .shadow(color: .black.opacity(0.18), radius: 8, y: 4)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Go to me")
        .accessibilityHint("Centers the map on your current location.")
    }

    // MARK: - Computed subviews

    @ViewBuilder
    private func lotBadge(for lot: Lot) -> some View {
        let row = webSocket.lotOccupancyRows[lot.mapId]
        let rate = row?.displayRate ?? occupancyRate(for: lot)
        let label = "\(Int(rate.rounded()))%"
        MapPin(
            label: label,
            color: colorForLot(lot),
            fontSize: 12,
            showsRestrictionBadge: permitAccessState(for: lot) == .restrictedNow
        )
    }

    @ViewBuilder
    private func clusterBadge(for cluster: LotCluster) -> some View {
        let percent = Int(cluster.occupancyRate.rounded())
        MapPin(
            label: "\(cluster.name): \(percent)%",
            color: OccupancyPalette.clusterColor(for: cluster.occupancyRate),
            fontSize: 13,
            showsRestrictionBadge: false
        )
    }

    // MARK: - Data

    private struct PolygonItem: Identifiable {
        enum Style {
            case regular
            case restrictedPreview
        }

        let id: String
        let lotId: String
        let coordinates: [CLLocationCoordinate2D]
        let color: Color
        let accessState: PermitRepository.LotAccessState
        let style: Style
    }

    private var polygonItems: [PolygonItem] {
        let visibleItems = visibleLots.flatMap { lot in
            let color = colorForLot(lot)
            let accessState = permitAccessState(for: lot)
            return lot.polygons.enumerated().map { index, ring in
                PolygonItem(
                    id: "\(lot.mapId)#\(index)",
                    lotId: lot.mapId,
                    coordinates: cleanedPolygonCoordinates(ring.outer),
                    color: color,
                    accessState: accessState,
                    style: .regular
                )
            }
        }

        guard let previewLot = temporarilyPreviewedLot,
              !visibleLots.contains(previewLot) else {
            return visibleItems
        }

        let previewItems = previewLot.polygons.enumerated().map { index, ring in
            PolygonItem(
                id: "preview:\(previewLot.mapId)#\(index)",
                lotId: previewLot.mapId,
                coordinates: cleanedPolygonCoordinates(ring.outer),
                color: .gray,
                accessState: .unavailable,
                style: .restrictedPreview
            )
        }

        return visibleItems + previewItems
    }

    private var visibleLots: [Lot] {
        let campusFiltered = lotRepository.byCampus(auth.enabledCampuses)
        if let mode = PermitRepository.noPermitMode(for: auth.permitType) ?? auth.noPermitMode {
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

    private func accessibilityText(for lot: Lot) -> String {
        let accessSuffix: String
        switch permitAccessState(for: lot) {
        case .openNow:
            accessSuffix = "Permit access available now."
        case .restrictedNow:
            accessSuffix = "Permit access unavailable right now."
        case .unavailable:
            accessSuffix = "Permit access unavailable."
        }
        if let row = webSocket.lotOccupancyRows[lot.mapId] {
            return "\(lot.shortName), \(row.occupancyHeadline), \(row.occupancyDetail.lowercased()). \(accessSuffix)"
        }
        let occupancy = webSocket.lotOccupancies[lot.mapId] ?? 0
        let capacity = max(lot.totalSpaces, 1)
        let freeSpots = max(capacity - occupancy, 0)
        return "\(lot.shortName), \(freeSpots) spots free out of \(capacity), live now. \(accessSuffix)"
    }

    private func colorForLot(_ lot: Lot) -> Color {
        let rate = webSocket.lotOccupancyRows[lot.mapId]?.displayRate ?? occupancyRate(for: lot)
        return OccupancyPalette.color(for: rate)
    }

    private func permitAccessState(for lot: Lot) -> PermitRepository.LotAccessState {
        permitRepository.accessState(
            lotId: lot.mapId,
            primary: auth.permitType,
            secondary: auth.secondaryPermitType
        )
    }

    // MARK: - Clustering

    private enum ZoomLevel { case lot, campus, hidden }

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
        if let row = webSocket.lotOccupancyRows[lot.mapId] {
            return min(100, row.displayRate)
        }
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

    @MapContentBuilder
    private func polygonShape(for item: PolygonItem) -> some MapContent {
        let style = polygonStyle(for: item)
        MapPolygon(coordinates: item.coordinates)
            .foregroundStyle(style.fill)
            .stroke(style.stroke, lineWidth: 2.0)
    }

    private func polygonStyle(for item: PolygonItem) -> (fill: Color, stroke: Color) {
        switch item.style {
        case .regular:
            let fill = item.color.opacity(item.accessState == .restrictedNow ? 0.32 : 0.60)
            let stroke = item.accessState == .restrictedNow
                ? Color.white.opacity(0.95)
                : item.color.opacity(0.9)
            return (fill, stroke)
        case .restrictedPreview:
            return (Color.gray.opacity(0.22), Color.gray.opacity(0.82))
        }
    }

    // MARK: - Actions

    private func focus(on lot: Lot) {
        temporarilyPreviewedLot = visibleLots.contains(lot) ? nil : lot
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
        temporarilyPreviewedLot = nil
        withAnimation(.easeInOut(duration: 0.4)) {
            position = .camera(MapCamera(centerCoordinate: coordinate, distance: 1500))
        }
    }

    private func clearDestination(ifMatching destination: TabBarState.FocusDestination) {
        guard selectedDestination == destination else { return }
        selectedDestination = nil
    }

    private func handleMapTap(at coordinate: CLLocationCoordinate2D) {
        if zoomLevel == .lot {
            if let exactLot = lotRepository.lotContaining(coordinate), visibleLots.contains(exactLot) {
                HapticManager.shared.selection()
                temporarilyPreviewedLot = nil
                selectedDestination = nil
                selectedLot = exactLot
                return
            }

            let nearest = visibleLots
                .map { lot in
                    (
                        lot: lot,
                        distance: metersBetween(coordinate, lot.location.clLocationCoordinate2D)
                    )
                }
                .min { $0.distance < $1.distance }

            if let nearest, nearest.distance <= lotTapSnapRadiusMeters {
                HapticManager.shared.selection()
                temporarilyPreviewedLot = nil
                selectedDestination = nil
                selectedLot = nearest.lot
                return
            }
        }

        temporarilyPreviewedLot = nil
        selectedLot = nil
        selectedDestination = nil
    }

    private func handleCenterOnUser() async {
        if !location.hasForegroundPermission {
            location.requestForegroundPermission()
            try? await Task.sleep(nanoseconds: 400_000_000)
        }

        guard location.hasForegroundPermission else {
            centerAlert = "Turn on location access to center the map on you."
            return
        }

        location.start()
        location.requestCurrentLocation()

        if let currentLocation = await waitForCurrentLocation() {
            withAnimation(.easeInOut(duration: 0.35)) {
                position = .camera(
                    MapCamera(
                        centerCoordinate: currentLocation.coordinate,
                        distance: 1400
                    )
                )
            }
        } else {
            centerAlert = "We couldn't get your current location right now."
        }
    }

    private func waitForCurrentLocation() async -> CLLocation? {
        if let latest = location.latestLocation,
           let at = location.latestLocationAt,
           Date().timeIntervalSince(at) < 10 {
            return latest
        }

        for _ in 0..<8 {
            try? await Task.sleep(nanoseconds: 250_000_000)
            if let latest = location.latestLocation {
                return latest
            }
        }
        return nil
    }
}

// MARK: - Map pins

private struct MapPin: View {
    let label: String
    let color: Color
    let fontSize: CGFloat
    let showsRestrictionBadge: Bool

    var body: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .topTrailing) {
                Text(label)
                    .font(.system(size: fontSize, weight: .bold).monospacedDigit())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .frame(minWidth: 32)
                    .background(
                        color,
                        in: RoundedRectangle(cornerRadius: 9, style: .continuous)
                    )

                if showsRestrictionBadge {
                    Image(systemName: "clock.badge.exclamationmark.fill")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Color(hex: 0xF59E0B), .white)
                        .padding(2)
                        .background(.ultraThinMaterial, in: Circle())
                        .offset(x: 7, y: -7)
                }
            }

            DownTriangle()
                .fill(color)
                .frame(width: 10, height: 6)
                .offset(y: -1)
        }
        .shadow(color: color.opacity(0.30), radius: 4, y: 2)
    }
}

private struct DestinationPin: View {
    let title: String

    var body: some View {
        VStack(spacing: 6) {
            Text(title)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.primary)
                .lineLimit(1)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(.ultraThinMaterial, in: Capsule())
                .overlay(Capsule().stroke(.white.opacity(0.30), lineWidth: 1))

            Image(systemName: "mappin.circle.fill")
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(Color(hex: 0xCC0033), .white)
                .shadow(color: .black.opacity(0.18), radius: 4, y: 2)
        }
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

private extension View {
    @ViewBuilder
    func liquidGlassCircle() -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect()
        } else {
            self
                .background(.ultraThinMaterial, in: Circle())
                .overlay {
                    Circle().stroke(.white.opacity(0.20), lineWidth: 1)
                }
        }
    }
}
