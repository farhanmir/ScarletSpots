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

    @StateObject private var auth = AuthManager.shared
    @StateObject private var permit = PermitRepository.shared
    @StateObject private var webSocket = WebSocketManager.shared
    @StateObject private var session = NativeSessionStore.shared
    @StateObject private var location = LocationEngine.shared

    @State private var parking = false
    @State private var forecast: [ForecastPoint] = []
    @State private var toastText: String?
    @State private var wobble = 0.0
    @State private var didWobble = false

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                headerSection
                statsRow
                featurePills
                permitInfoCard
                notesCard
                forecastSection
                actionButtons

                if let toastText {
                    Text(toastText)
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.65))
                        .frame(maxWidth: .infinity, alignment: .center)
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 20)
            .padding(.bottom, 12)
            .lotDetailsGlass()
            .padding(.horizontal, 10)
            .padding(.top, 10)
            .padding(.bottom, 8)
            .rotationEffect(.degrees(-wobble * 5))
            .offset(y: abs(wobble) * 2)
        }
        .background(
            ZStack {
                Color.black.opacity(0.72).ignoresSafeArea()
                LinearGradient(
                    colors: [
                        Color.black.opacity(0.38),
                        Color(hex: 0x14080D).opacity(0.30),
                        Color(hex: 0x08090E).opacity(0.34)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .ignoresSafeArea()
            }
        )
        .task {
            await loadForecast()
            await triggerLot67WobbleIfNeeded()
        }
    }

    // MARK: - Sections

    private var headerSection: some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 8) {
                if let campus = lot.address.campus {
                    Text("\(campus) Campus")
                        .font(.system(size: 11, weight: .bold))
                        .tracking(0.4)
                        .foregroundStyle(Color(hex: 0xF87171))
                        .padding(.horizontal, 9)
                        .padding(.vertical, 3)
                        .background(Color(hex: 0xCC0033).opacity(0.16), in: Capsule())
                        .overlay(Capsule().stroke(Color(hex: 0xF87171).opacity(0.30), lineWidth: 1))
                }
                Text(lot.shortName)
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }

            Spacer()

            Button {
                Task { await toggleFavorite() }
            } label: {
                Image(systemName: favoriteIds.contains(lot.mapId) ? "star.fill" : "star")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(favoriteIds.contains(lot.mapId) ? Color(hex: 0xF59E0B) : .white.opacity(0.7))
                    .frame(width: 34, height: 34)
                    .background(Color.white.opacity(0.08), in: Circle())
                    .overlay(Circle().stroke(Color.white.opacity(0.12), lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
        .padding(.bottom, 2)
    }

    private var statsRow: some View {
        HStack(spacing: 10) {
            statCard(value: "\(Int((occupancyRatio * 100).rounded()))%", label: "Full", color: ringColor)
            statCard(value: "\(liveOccupancy)", label: "Occupied", color: .white)
            statCard(value: "\(displayCapacity)", label: "Capacity", color: .white)
        }
    }

    private func statCard(value: String, label: String, color: Color) -> some View {
        VStack(spacing: 3) {
            Text(value)
                .font(.system(size: 22, weight: .heavy))
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.white.opacity(0.55))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .padding(.horizontal, 6)
        .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.white.opacity(0.10), lineWidth: 1))
    }

    private var featurePills: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                if lot.handicapped > 0 {
                    featurePill(icon: "figure.roll", text: "Accessible", color: Color(hex: 0xC084FC))
                }
                if lot.evCharging > 0 {
                    featurePill(icon: "bolt.car.fill", text: "EV Charging", color: Color(hex: 0x60A5FA))
                }
                if lot.student {
                    featurePill(icon: "graduationcap.fill", text: "Student", color: Color(hex: 0x818CF8))
                }
                if lot.employee {
                    featurePill(icon: "briefcase.fill", text: "Employee", color: Color(hex: 0x34D399))
                }
            }
        }
    }

    private var permitInfoCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Access Rules", systemImage: "checkmark.shield")
                    .font(.headline)
                    .foregroundStyle(.white)
                Spacer()
                Text(lotAvailable ? "OPEN" : "CLOSED")
                    .font(.caption2.bold())
                    .tracking(0.5)
                    .foregroundStyle(lotAvailable ? Color(hex: 0x4ADE80) : Color(hex: 0xEF4444))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background((lotAvailable ? Color(hex: 0x4ADE80) : Color(hex: 0xEF4444)).opacity(0.12), in: Capsule())
            }

            if let primaryRule = primaryAccessRule {
                accessRow(
                    icon: accessIcon,
                    title: "Your permit",
                    detail: primaryRule,
                    accent: accessColor
                )
            } else {
                accessRow(
                    icon: "questionmark.circle.fill",
                    title: "No Permit Set",
                    detail: "Set a permit in Profile.",
                    accent: .white.opacity(0.7)
                )
            }

            if let secondaryRule {
                accessRow(
                    icon: "person.crop.rectangle.badge.plus",
                    title: "Secondary permit",
                    detail: secondaryRule,
                    accent: Color(hex: 0xC084FC)
                )
            }
        }
        .padding(14)
        .background(Color.black.opacity(0.20), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 1))
    }

    private func accessRow(icon: String, title: String, detail: String, accent: Color) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(accent)
                .frame(width: 20)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.bold())
                    .foregroundStyle(.white)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.70))
            }
        }
    }

    private func featurePill(icon: String, text: String, color: Color) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
            Text(text)
                .font(.system(size: 12, weight: .bold))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .foregroundStyle(color)
        .background(color.opacity(0.15), in: Capsule())
        .overlay(Capsule().stroke(color.opacity(0.30), lineWidth: 1))
    }

    private var notesCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "info.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.55))
                Text("NOTES")
                    .font(.caption2.bold())
                    .tracking(1)
                    .foregroundStyle(.white.opacity(0.52))
            }
            Text(lot.note.isEmpty ? "No notes provided for this lot." : lot.note)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white.opacity(0.90))
                .lineSpacing(3)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.black.opacity(0.20), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 1))
    }

    private var forecastSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Forecast")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white.opacity(0.58))
                .tracking(0.7)
            ForecastChart(points: displayForecastPoints, capacity: displayCapacity)
                .padding(12)
                .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.white.opacity(0.10), lineWidth: 1))
        }
        .padding(.top, 10)
    }

    private var actionButtons: some View {
        HStack(spacing: 10) {
            if !hasActiveSession {
                Button {
                    HapticManager.shared.softImpact()
                    Task { await park() }
                } label: {
                    HStack(spacing: 10) {
                        if parking { ProgressView().tint(.white) }
                        Image(systemName: "p.circle.fill")
                        Text(parking ? "Parking..." : "Park Here")
                    }
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 54)
                    .background(Color(hex: 0xCC0033), in: RoundedRectangle(cornerRadius: 16))
                    .shadow(color: Color(hex: 0xCC0033).opacity(0.3), radius: 8, y: 4)
                }
                .disabled(parking)
            }

            Button {
                openDirections()
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                    if hasActiveSession {
                        Text("Directions")
                    } else {
                        Text("Navigate")
                    }
                }
                    .font(.headline)
                    .foregroundStyle(Color(hex: 0x60A5FA))
                    .frame(maxWidth: .infinity)
                    .frame(height: 54)
                    .background(Color(hex: 0x60A5FA).opacity(0.10), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(Color(hex: 0x60A5FA).opacity(0.25), lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)
        }
    }

    private var liveOccupancy: Int {
        webSocket.lotOccupancies[lot.mapId] ?? lot.generalAvailable
    }

    private var displayCapacity: Int {
        max(lot.totalSpaces, 1)
    }

    private var occupancyRatio: Double {
        min(1.0, Double(liveOccupancy) / Double(displayCapacity))
    }

    private var ringColor: Color {
        OccupancyPalette.color(forRatio: occupancyRatio)
    }

    private var displayForecastPoints: [ForecastPoint] {
        guard !forecast.isEmpty else { return [] }
        return forecast.enumerated().map { index, point in
            ForecastPoint(
                label: relativeForecastLabel(for: index, total: forecast.count),
                count: point.count,
                occupancyRate: point.occupancyRate
            )
        }
    }

    private var lotAvailable: Bool {
        (permit.isLotAvailableNow(permitType: auth.permitType, lotId: lot.mapId) ?? false)
            || (permit.isLotAvailableNow(permitType: auth.secondaryPermitType, lotId: lot.mapId) ?? false)
    }

    private var accessIcon: String {
        lotAvailable ? "checkmark.shield.fill" : "xmark.shield.fill"
    }

    private var accessColor: Color {
        lotAvailable ? Color(hex: 0x4ADE80) : Color(hex: 0xEF4444)
    }

    private var primaryAccessRule: String? {
        conciseAccessRule(for: auth.permitType)
    }

    private var secondaryRule: String? {
        conciseAccessRule(for: auth.secondaryPermitType)
    }

    private var isCurrentlyParkedHere: Bool {
        session.activeSession?.lotId == lot.mapId
    }

    private var hasActiveSession: Bool {
        session.activeSession != nil
    }

    private func park() async {
        guard !parking else { return }
        parking = true
        defer { parking = false }
        let idempotencyKey = "manual_\(lot.mapId)_\(Int(Date().timeIntervalSince1970))"
        let coordinate = parkingStartCoordinate
        do {
            try await ParkAPI.startSession(
                lotId: lot.mapId,
                latitude: coordinate.latitude,
                longitude: coordinate.longitude,
                autoStarted: false,
                source: "manual",
                idempotencyKey: idempotencyKey
            )
            await session.refresh()
            HapticManager.shared.success()
            toastText = "Session started."
        } catch let apiError as APIError {
            HapticManager.shared.error()
            toastText = apiError.localizedDescription
        } catch let urlError as URLError where urlError.code == .notConnectedToInternet || urlError.code == .timedOut || urlError.code == .networkConnectionLost {
            let payload = try? JSONSerialization.data(withJSONObject: [
                "lotId": lot.mapId,
                "latitude": coordinate.latitude,
                "longitude": coordinate.longitude,
                "autoStarted": false,
                "source": "manual"
            ])
            await OfflineQueue.shared.enqueue(
                type: "PARK",
                endpoint: "park/session",
                payload: payload,
                idempotencyKey: idempotencyKey
            )
            HapticManager.shared.warning()
            toastText = "Offline — we'll start the session when you reconnect."
        } catch {
            HapticManager.shared.error()
            toastText = "Error: \(error.localizedDescription)"
        }
    }

    private var parkingStartCoordinate: CLLocationCoordinate2D {
        guard let current = location.latestLocation?.coordinate else {
            return lot.location.clLocationCoordinate2D
        }
        return isInsideCurrentLot(current) ? current : lot.location.clLocationCoordinate2D
    }

    private func isInsideCurrentLot(_ coordinate: CLLocationCoordinate2D) -> Bool {
        lot.polygons.contains { ring in
            GeometryMath.pointInPolygon(coordinate, polygon: ring.outer)
                && !ring.holes.contains(where: { GeometryMath.pointInPolygon(coordinate, polygon: $0) })
        }
    }

    private func toggleFavorite() async {
        if favoriteIds.contains(lot.mapId) {
            try? await FavoritesAPI.remove(lotId: lot.mapId)
            favoriteIds.remove(lot.mapId)
            HapticManager.shared.selection()
        } else {
            try? await FavoritesAPI.add(lotId: lot.mapId)
            favoriteIds.insert(lot.mapId)
            HapticManager.shared.selection()
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

    @MainActor
    private func triggerLot67WobbleIfNeeded() async {
        guard !didWobble, lot.shortName.contains("67") else { return }
        didWobble = true

        let sequence: [(Double, UInt64)] = [
            (1.0, 120_000_000),
            (-1.0, 180_000_000),
            (0.7, 110_000_000),
            (-0.7, 160_000_000),
            (0.4, 100_000_000),
            (-0.4, 140_000_000),
            (0.0, 120_000_000),
        ]

        for (value, duration) in sequence {
            withAnimation(.linear(duration: Double(duration) / 1_000_000_000)) {
                wobble = value
            }
            try? await Task.sleep(nanoseconds: duration)
        }
    }

    private func conciseAccessRule(for permitType: String?) -> String? {
        guard let permitType else { return nil }
        guard let text = permit.scheduleText(permitType: permitType, lotId: lot.mapId) else {
            return shortenedPermitName(permitType)
        }

        let pieces = [text.0, text.1]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        if pieces.isEmpty {
            return shortenedPermitName(permitType)
        }
        return pieces.joined(separator: " • ")
    }

    private func shortenedPermitName(_ permitType: String) -> String {
        permitType
            .replacingOccurrences(of: " Permit", with: "")
            .replacingOccurrences(of: " permit", with: "")
    }

    private func relativeForecastLabel(for index: Int, total: Int) -> String {
        let nowIndex = min(2, max(total - 1, 0))
        let delta = index - nowIndex
        if delta == 0 { return "Now" }
        if delta < 0 { return "-\(-delta) hr" }
        return "+\(delta) hr"
    }
}

private extension View {
    @ViewBuilder
    func lotDetailsGlass() -> some View {
        if #available(iOS 26.0, *) {
            self
                .background(Color.black.opacity(0.34), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
                .glassEffect(in: RoundedRectangle(cornerRadius: 28, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .stroke(Color.white.opacity(0.12), lineWidth: 1)
                )
        } else {
            self
                .background(
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .fill(.ultraThinMaterial)
                        .overlay(Color.black.opacity(0.46))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .stroke(Color.white.opacity(0.10), lineWidth: 1)
                )
        }
    }
}
