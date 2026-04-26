import SwiftUI
import MapKit

/// Bottom sheet with everything you'd want to know about a single lot:
/// occupancy, permit access rules, operating hours, forecast, and the
/// Park/Favorite/Directions actions.
///
/// All derived data (permit access, live availability, occupancy ratio) is
/// recomputed on the fly so changing the user's permit in Settings updates
/// the sheet immediately.
struct LotDetailsSheet: View {
    let lot: Lot
    @Binding var favoriteIds: Set<String>

    @EnvironmentObject private var tabBarState: TabBarState
    @StateObject private var auth = AuthManager.shared
    @StateObject private var permit = PermitRepository.shared
    @StateObject private var webSocket = WebSocketManager.shared
    @StateObject private var session = NativeSessionStore.shared

    @State private var parking = false
    @State private var forecast: [ForecastPoint] = []
    @State private var liveOccupancyOverride: Int?
    @State private var toastText: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    headerSection
                    featurePills
                    occupancyCard
                    accessCard
                    
                    if !forecast.isEmpty || displayCapacity > 0 {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Forecast")
                                .font(.headline)
                                .padding(.leading, 4)
                            ForecastChart(points: forecast, capacity: displayCapacity)
                                .padding(16)
                                .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
                        }
                    }
                    
                    actionButtons
                    
                    if let toastText {
                        Text(toastText)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .center)
                    }
                }
                .padding(20)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle(lot.shortName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await toggleFavorite() }
                    } label: {
                        Image(systemName: favoriteIds.contains(lot.mapId) ? "star.fill" : "star")
                            .foregroundStyle(favoriteIds.contains(lot.mapId) ? .yellow : .primary)
                    }
                }
            }
        }
        .task {
            await loadForecast()
        }
    }

    // MARK: - Sections

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(lot.propertyName)
                .font(.title2.bold())
                .textSelection(.enabled)
            
            HStack(spacing: 4) {
                Image(systemName: "mappin.and.ellipse")
                    .font(.caption)
                Text([lot.address.campus, lot.address.cityCode]
                    .compactMap { $0 }
                    .joined(separator: " · "))
                    .font(.subheadline)
                    .textSelection(.enabled)
            }
            .foregroundStyle(.secondary)
        }
    }

    private var featurePills: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                if lot.handicapped > 0 {
                    featurePill(icon: "figure.roll", text: "\(lot.handicapped) ADA")
                }
                if lot.evCharging > 0 {
                    featurePill(icon: "bolt.car.fill", text: "\(lot.evCharging) EV")
                }
                if lot.garage {
                    featurePill(icon: "building.2.fill", text: "Garage")
                }
                if lot.solar {
                    featurePill(icon: "sun.max.fill", text: "Solar")
                }
                if lot.smartGate {
                    featurePill(icon: "sensor.tag.radiowaves.forward.fill", text: "Smart Gate")
                }
                if lot.foodTruck > 0 {
                    featurePill(icon: "mouth.fill", text: "Food")
                }
            }
            .padding(.horizontal, 4)
        }
    }

    private func featurePill(icon: String, text: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.caption2)
            Text(text)
                .font(.caption.bold())
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: Capsule())
        .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
    }

    private var occupancyCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Availability")
                .font(.headline)
            
            HStack(spacing: 20) {
                occupancyRing
                
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text("\(max(0, displayCapacity - liveOccupancy))")
                            .font(.title.bold())
                        Text("spots free")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    
                    Text("out of \(displayCapacity) total")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                    if let source = liveOccupancySource {
                        Text(source)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                
                Spacer()
            }
        }
        .padding(20)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20))
    }

    private var occupancyRing: some View {
        ZStack {
            Circle()
                .stroke(Color.gray.opacity(0.25), lineWidth: 6)
            Circle()
                .trim(from: 0, to: occupancyRatio)
                .stroke(ringColor, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeInOut(duration: 0.4), value: occupancyRatio)
            Text("\(Int(occupancyRatio * 100))%")
                .font(.caption.bold())
        }
        .frame(width: 60, height: 60)
    }

    private var accessCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Access Rules")
                .font(.headline)
            
            VStack(alignment: .leading, spacing: 12) {
                if let text = permit.scheduleText(permitType: auth.permitType, lotId: lot.mapId) {
                    accessRow(icon: accessIcon, title: "Primary: \(auth.permitType ?? "None")", detail: text.0, accent: accessColor)
                    if !text.1.isEmpty {
                        accessRow(icon: "clock", title: "Hours", detail: text.1, accent: .blue)
                    }
                } else if let permitType = auth.permitType {
                    accessRow(icon: accessIcon, title: "Permit \(permitType)", detail: "No schedule available", accent: accessColor)
                } else {
                    accessRow(icon: "questionmark.circle", title: "No Permit", detail: "Select a permit in Profile to see rules", accent: .secondary)
                }
                
                if let secondary = auth.secondaryPermitType,
                   let text = permit.scheduleText(permitType: secondary, lotId: lot.mapId) {
                    Divider().padding(.vertical, 4)
                    accessRow(icon: "person.crop.rectangle.badge.plus", title: "Secondary: \(secondary)", detail: text.0, accent: .purple)
                }
            }
        }
        .padding(20)
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20))
    }

    private func accessRow(icon: String, title: String, detail: String, accent: Color) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(accent)
                .frame(width: 24)
            
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.bold())
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var actionButtons: some View {
        VStack(spacing: 12) {
            Button {
                Task { await park() }
            } label: {
                HStack(spacing: 10) {
                    if parking { ProgressView().tint(.white) }
                    Image(systemName: "parkingsign.circle.fill")
                    Text(parking ? "Parking..." : "Park Here")
                }
                .font(.headline)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding()
                .background(isCurrentlyParkedHere ? Color.gray : Color(hex: 0xCC0033), in: RoundedRectangle(cornerRadius: 16))
                .shadow(color: (isCurrentlyParkedHere ? Color.clear : Color(hex: 0xCC0033)).opacity(0.3), radius: 8, y: 4)
            }
            .disabled(parking || isCurrentlyParkedHere)

            Button {
                openDirections()
            } label: {
                HStack {
                    Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                    Text("Get Directions")
                }
                .font(.subheadline.bold())
                .foregroundStyle(.primary)
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.primary.opacity(0.1), lineWidth: 1))
            }
        }
    }

    // MARK: - Helpers

    private func metricChip(icon: String, text: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon).font(.caption2)
            Text(text).font(.caption2.monospacedDigit())
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(.gray.opacity(0.15), in: Capsule())
    }

    private func bullet(icon: String, text: String, accent: Color) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: icon)
                .foregroundStyle(accent)
                .frame(width: 18)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(.primary)
                .textSelection(.enabled)
        }
    }

    private var liveOccupancy: Int {
        liveOccupancyOverride ?? (webSocket.lotOccupancies[lot.mapId] ?? lot.generalAvailable)
    }

    private var liveOccupancySource: String? {
        guard let row = webSocket.lotOccupancyRows[lot.mapId] else { return nil }
        let source = row.source ?? "unknown"
        let prettySource: String
        switch source {
        case "realtime":
            prettySource = "Realtime occupancy"
        case "blended_heuristic":
            prettySource = "Heuristic + realtime estimate"
        case "seeded_heuristic":
            prettySource = "Heuristic estimate"
        default:
            prettySource = source.replacingOccurrences(of: "_", with: " ").capitalized
        }
        if let ci = row.confidenceInterval {
            return "\(prettySource) (±\(Int(ci.rounded()))%)"
        }
        return prettySource
    }

    private var displayCapacity: Int {
        max(lot.totalSpaces, 1)
    }

    private var occupancyRatio: Double {
        min(1.0, Double(liveOccupancy) / Double(displayCapacity))
    }

    private var ringColor: Color {
        if occupancyRatio > 0.9 { return .red }
        if occupancyRatio > 0.6 { return .orange }
        return .green
    }

    private var isCurrentlyParkedHere: Bool {
        session.activeSession?.lotId == lot.mapId
    }

    private var isAvailableNow: Bool? {
        permit.isLotAvailableNow(permitType: auth.permitType, lotId: lot.mapId)
    }

    private var accessIcon: String {
        switch isAvailableNow {
        case .some(true): return "checkmark.seal.fill"
        case .some(false): return "xmark.seal.fill"
        case .none: return "info.circle"
        }
    }

    private var accessColor: Color {
        switch isAvailableNow {
        case .some(true): return .green
        case .some(false): return .red
        case .none: return .secondary
        }
    }

    // MARK: - Actions

    private func park() async {
        guard !parking else { return }
        parking = true
        defer { parking = false }
        let idempotencyKey = "manual_\(lot.mapId)_\(Int(Date().timeIntervalSince1970))"
        do {
            try await ParkAPI.startSession(
                lotId: lot.mapId,
                latitude: lot.location.lat,
                longitude: lot.location.lng,
                autoStarted: false,
                source: "manual",
                idempotencyKey: idempotencyKey
            )
            await session.refresh()
            toastText = "Session started — good luck out there."
        } catch let apiError as APIError {
            toastText = apiError.localizedDescription
        } catch let urlError as URLError where urlError.code == .notConnectedToInternet || urlError.code == .timedOut || urlError.code == .networkConnectionLost {
            let payload = try? JSONSerialization.data(withJSONObject: [
                "lotId": lot.mapId,
                "latitude": lot.location.lat,
                "longitude": lot.location.lng,
                "autoStarted": false,
                "source": "manual"
            ])
            await OfflineQueue.shared.enqueue(
                type: "PARK",
                endpoint: "park/session",
                payload: payload,
                idempotencyKey: idempotencyKey
            )
            toastText = "Offline — we'll start the session when you reconnect."
        } catch {
            toastText = "Error: \(error.localizedDescription)"
        }
    }

    private func toggleFavorite() async {
        if favoriteIds.contains(lot.mapId) {
            try? await FavoritesAPI.remove(lotId: lot.mapId)
            favoriteIds.remove(lot.mapId)
        } else {
            try? await FavoritesAPI.add(lotId: lot.mapId)
            favoriteIds.insert(lot.mapId)
        }
        OfflineCache.shared.cacheFavorites(Array(favoriteIds))
    }

    private func openDirections() {
        let coordinate = lot.location.clLocationCoordinate2D
        let mapItem = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
        mapItem.name = lot.shortName
        mapItem.openInMaps(launchOptions: [
            MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving
        ])
    }

    private func loadForecast() async {
        do {
            forecast = try await LotsAPI.forecast(
                lotId: lot.mapId,
                capacity: displayCapacity,
                currentOccupancy: liveOccupancy
            )
        } catch {
            forecast = []
        }
    }
}
