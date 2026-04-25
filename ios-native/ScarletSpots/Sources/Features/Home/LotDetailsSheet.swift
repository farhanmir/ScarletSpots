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
                VStack(alignment: .leading, spacing: 18) {
                    header
                    occupancyPanel
                    permitPanel
                    if !forecast.isEmpty || displayCapacity > 0 {
                        ForecastChart(points: forecast, capacity: displayCapacity)
                            .padding(14)
                            .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14))
                    }
                    actionButtons
                    if let toastText {
                        Text(toastText)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(20)
            }
            .navigationTitle(lot.shortName)
            .navigationBarTitleDisplayMode(.inline)
        }
        .task {
            await loadForecast()
        }
    }

    // MARK: - Sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(lot.propertyName)
                .font(.title3.weight(.semibold))
                .textSelection(.enabled)
            Text([lot.address.campus, lot.address.cityCode]
                .compactMap { $0 }
                .joined(separator: " · "))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
        }
    }

    private var occupancyPanel: some View {
        HStack(spacing: 14) {
            occupancyRing
            VStack(alignment: .leading, spacing: 6) {
                Text("\(liveOccupancy) / \(displayCapacity)")
                    .font(.title2.monospacedDigit().bold())
                Text("\(max(0, displayCapacity - liveOccupancy)) spots free")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                HStack(spacing: 10) {
                    metricChip(icon: "figure.roll", text: "\(lot.handicapped) ADA")
                    metricChip(icon: "bolt.car", text: "\(lot.evCharging) EV")
                }
            }
            Spacer()
        }
        .padding(14)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14))
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

    private var permitPanel: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Access")
                .font(.headline)
            if let text = permit.scheduleText(permitType: auth.permitType, lotId: lot.mapId) {
                bullet(icon: accessIcon, text: text.0, accent: accessColor)
                if !text.1.isEmpty {
                    bullet(icon: "clock", text: text.1, accent: .secondary)
                }
            } else if let permitType = auth.permitType {
                bullet(icon: accessIcon, text: "Permit \(permitType) — no schedule on file", accent: accessColor)
            } else {
                bullet(icon: "questionmark.circle", text: "No permit selected yet", accent: .secondary)
            }
            if let secondary = auth.secondaryPermitType,
               let text = permit.scheduleText(permitType: secondary, lotId: lot.mapId) {
                bullet(icon: "person.crop.rectangle.badge.plus", text: "Secondary: \(text.0)", accent: .secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14))
    }

    private var actionButtons: some View {
        VStack(spacing: 10) {
            Button {
                Task { await park() }
            } label: {
                HStack {
                    if parking { ProgressView().tint(.white) }
                    Text(parking ? "Parking..." : "Park Here")
                        .font(.headline)
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.red)
            .disabled(parking || isCurrentlyParkedHere)

            HStack(spacing: 10) {
                Button {
                    Task { await toggleFavorite() }
                } label: {
                    Label(
                        favoriteIds.contains(lot.mapId) ? "Unfavorite" : "Favorite",
                        systemImage: favoriteIds.contains(lot.mapId) ? "heart.fill" : "heart"
                    )
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)

                Button {
                    openDirections()
                } label: {
                    Label("Directions", systemImage: "car.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
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
        } catch {
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
