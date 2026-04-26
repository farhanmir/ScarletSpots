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

    var body: some View {
        ZStack(alignment: .bottom) {
            Map(position: $position) {
                ForEach(polygonItems) { item in
                    MapPolygon(coordinates: item.coordinates)
                        .foregroundStyle(item.color.opacity(0.60))
                        .stroke(item.color.opacity(0.9), lineWidth: 2.0)
                }
                ForEach(visibleLots) { lot in
                    Annotation(zoomDistance < 2500 ? lot.shortName : "", coordinate: lot.location.clLocationCoordinate2D) {
                        Button { selectedLot = lot } label: {
                            lotBadge(for: lot)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(accessibilityText(for: lot))
                        .accessibilityHint("Opens details for \(lot.shortName).")
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
                MapCompass()
                MapScaleView()
            }
            .onMapCameraChange(frequency: .continuous) { context in
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
        .overlay(alignment: .bottomLeading) {
            Button {
                withAnimation(.easeInOut(duration: 0.4)) {
                    if let userLoc = location.latestLocation {
                        position = .camera(MapCamera(centerCoordinate: userLoc.coordinate, distance: 1500))
                    }
                }
            } label: {
                Image(systemName: "location.fill")
                    .font(.title3)
                    .foregroundStyle(.primary)
                    .padding(10)
                    .background(.ultraThinMaterial, in: Circle())
                    .shadow(radius: 2)
            }
            .padding(.leading, 12)
            .padding(.bottom, 22)
        }
        .sheet(item: $selectedLot) { lot in
            LotDetailsSheet(lot: lot, favoriteIds: $favoriteIds)
                .presentationDetents([.medium, .large])
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
        
        Text("\(percent)%")
            .font(.caption2.bold().monospacedDigit())
            .foregroundStyle(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(colorForLot(lot), in: Capsule())
            .overlay(Capsule().stroke(.white.opacity(0.5), lineWidth: 1))
            .shadow(color: .black.opacity(0.25), radius: 2, y: 1)
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
                    coordinates: ring.outer,
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
        let capacity = max(lot.totalSpaces, 1)
        let freeSpots = max(capacity - occupancy, 0)
        return "\(lot.shortName), \(freeSpots) spots free out of \(capacity)."
    }

    private func colorForLot(_ lot: Lot) -> Color {
        let occupancy = webSocket.lotOccupancies[lot.mapId] ?? 0
        let capacity = max(lot.totalSpaces, 1)
        let ratio = Double(occupancy) / Double(capacity)

        if ratio > 0.9 { return .red }
        if ratio > 0.6 { return .orange }
        return .green
    }

    private func formatDistance(meters: Double) -> String {
        let feet = meters * 3.28084
        if feet < 528 { return "\(Int(feet)) ft" }
        let miles = feet / 5280
        return String(format: "%.1f mi", miles)
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
