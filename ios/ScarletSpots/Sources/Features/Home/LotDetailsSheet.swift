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
    @Environment(\.colorScheme) private var colorScheme
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
    @State private var forecastAnchorHour = LotDetailsSheet.currentForecastAnchorHour()

    private var isDark: Bool { colorScheme == .dark }
    private var primaryText: Color { isDark ? .white : Color(hex: 0x111827) }
    private var secondaryText: Color { isDark ? .white.opacity(0.64) : Color(hex: 0x6B7280) }
    private var tertiaryText: Color { isDark ? .white.opacity(0.50) : Color(hex: 0x9CA3AF) }

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
                        .foregroundStyle(secondaryText)
                        .frame(maxWidth: .infinity, alignment: .center)
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 20)
            .padding(.bottom, 12)
            .rotationEffect(.degrees(-wobble * 5))
            .offset(y: abs(wobble) * 2)
        }
        .lotDetailsBackground(isDark: isDark)
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
                        .foregroundStyle(isDark ? Color(hex: 0xF87171) : Color(hex: 0xBE123C))
                        .padding(.horizontal, 9)
                        .padding(.vertical, 3)
                        .campusBadgeGlass(tint: Color(hex: 0xCC0033), isDark: isDark)
                }
                Text(lot.shortName)
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(primaryText)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if let occupancyRow {
                    Text("\(occupancyRow.occupancyHeadline) • \(occupancyRow.sourceSummary)")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(secondaryText)
                }
            }

            Spacer()

            Button {
                Task { await toggleFavorite() }
            } label: {
                Image(systemName: favoriteIds.contains(lot.mapId) ? "star.fill" : "star")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(favoriteIds.contains(lot.mapId) ? Color(hex: 0xF59E0B) : tertiaryText)
                    .frame(width: 34, height: 34)
                    .favoriteButtonGlass(isDark: isDark)
            }
            .buttonStyle(.plain)
        }
        .padding(.bottom, 2)
    }

    private var statsRow: some View {
        HStack(spacing: 10) {
            if let occupancyRow {
                statCard(value: occupancyRow.shortPercentLabel, label: occupancyRow.isLivePrimary ? "Occupied" : "Estimated", color: ringColor)
                statCard(value: occupancyRow.compactStatusLabel, label: occupancyRow.compactSourceLabel, color: primaryText)
            } else {
                statCard(value: "\(Int((occupancyRatio * 100).rounded()))%", label: "Full", color: ringColor)
                statCard(value: "\(liveOccupancy)", label: "Occupied", color: primaryText)
            }
            statCard(value: "\(displayCapacity)", label: "Capacity", color: primaryText)
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
                .foregroundStyle(tertiaryText)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .padding(.horizontal, 6)
        .statCardGlass(isDark: isDark)
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
                    .foregroundStyle(primaryText)
                Spacer()
                Text(accessStatusLabel)
                    .font(.caption2.bold())
                    .tracking(0.5)
                    .foregroundStyle(accessColor)
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
                    accent: tertiaryText
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
        .infoCardGlass(isDark: isDark)
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
                    .foregroundStyle(primaryText)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(secondaryText)
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
        .featurePillGlass(tint: color, isDark: isDark)
    }

    private var notesCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "info.circle.fill")
                    .font(.caption)
                    .foregroundStyle(tertiaryText)
                Text("NOTES")
                    .font(.caption2.bold())
                    .tracking(1)
                    .foregroundStyle(tertiaryText)
            }
            Text(lot.note.isEmpty ? "No notes provided for this lot." : lot.note)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(primaryText)
                .lineSpacing(3)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .infoCardGlass(isDark: isDark)
    }

    private var forecastSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Forecast")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(tertiaryText)
                    .tracking(0.7)
                if let occupancyRow, !occupancyRow.isLivePrimary {
                    Text("Expected pattern from now")
                        .font(.caption2)
                        .foregroundStyle(tertiaryText)
                }
            }
            ForecastChart(points: displayForecastPoints, capacity: displayCapacity)
                .padding(12)
                .forecastCardGlass(isDark: isDark)
        }
        .padding(.top, 10)
    }

    private var actionButtons: some View { actionButtonsContent }

    @ViewBuilder
    private var actionButtonsContent: some View {
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
                    .parkButtonGlass()
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
                .navigateButtonGlass(isDark: isDark)
            }
            .buttonStyle(.plain)
        }
    }

    private var liveOccupancy: Int {
        occupancyRow?.count ?? webSocket.lotOccupancies[lot.mapId] ?? lot.generalAvailable
    }

    private var occupancyRow: OccupancyRow? {
        webSocket.lotOccupancyRows[lot.mapId]
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
                label: forecastHourLabel(for: index, total: forecast.count),
                count: point.count,
                occupancyRate: point.occupancyRate
            )
        }
    }

    private var lotAvailable: Bool {
        accessState == .openNow
    }

    private var accessState: PermitRepository.LotAccessState {
        permit.accessState(
            lotId: lot.mapId,
            primary: auth.permitType,
            secondary: auth.secondaryPermitType
        )
    }

    private var accessStatusLabel: String {
        switch accessState {
        case .openNow:
            return "OPEN"
        case .restrictedNow:
            return "NOT RIGHT NOW"
        case .unavailable:
            return "CLOSED"
        }
    }

    private var accessIcon: String {
        switch accessState {
        case .openNow:
            return "checkmark.shield.fill"
        case .restrictedNow:
            return "clock.badge.exclamationmark.fill"
        case .unavailable:
            return "xmark.shield.fill"
        }
    }

    private var accessColor: Color {
        switch accessState {
        case .openNow:
            return Color(hex: 0x4ADE80)
        case .restrictedNow:
            return Color(hex: 0xF59E0B)
        case .unavailable:
            return Color(hex: 0xEF4444)
        }
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
        if let specialRule = noPermitAccessRule(for: permitType) {
            return specialRule
        }
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
        PermitRepository.displayName(for: permitType)
            .replacingOccurrences(of: " Permit", with: "")
            .replacingOccurrences(of: " permit", with: "")
    }

    private func noPermitAccessRule(for permitType: String) -> String? {
        switch permitType {
        case PermitRepository.noPermitAll:
            return "Showing all lots. Permit filtering is off."
        case PermitRepository.noPermitCommuter:
            return permit.allCommuterLotIds.contains(lot.mapId)
                ? "Showing commuter-accessible lots only."
                : "This lot is outside the commuter-only filter."
        default:
            return nil
        }
    }

    private func forecastHourLabel(for index: Int, total: Int) -> String {
        let nowIndex = min(2, max(total - 1, 0))
        let delta = index - nowIndex
        if delta == 0 { return "NOW" }

        guard let target = Calendar.current.date(byAdding: .hour, value: delta, to: forecastAnchorHour) else {
            return "NOW"
        }
        return Self.forecastHourFormatter.string(from: target)
    }

    private static func currentForecastAnchorHour(now: Date = Date()) -> Date {
        Calendar.current.dateInterval(of: .hour, for: now)?.start ?? now
    }

    private static let forecastHourFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = .current
        formatter.dateFormat = "h a"
        return formatter
    }()
}

// MARK: - Liquid Glass view modifiers

private extension View {

    // MARK: Sheet background

    /// Keeps the sheet content transparent on iOS 26+ so the presentation-level
    /// Liquid Glass can show through. Older OS versions keep the local fallback.
    @ViewBuilder
    func lotDetailsBackground(isDark: Bool) -> some View {
        if #available(iOS 26.0, *) {
            self.background(Color.clear)
        } else {
            self
                .background(
                    ZStack {
                        if isDark {
                            Color.black.opacity(0.86).ignoresSafeArea()
                            Rectangle()
                                .fill(.ultraThinMaterial.opacity(0.46))
                                .ignoresSafeArea()
                        } else {
                            LinearGradient(
                                colors: [
                                    Color(hex: 0xFFF8FA),
                                    Color(hex: 0xF8FAFC),
                                    Color(hex: 0xF3F4F6)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                            .ignoresSafeArea()
                        }
                    }
                )
        }
    }

    // MARK: Campus badge

    @ViewBuilder
    func campusBadgeGlass(tint: Color, isDark: Bool) -> some View {
        self
            .background(tint.opacity(isDark ? 0.14 : 0.16), in: Capsule())
            .overlay(Capsule().stroke(Color(hex: 0xF87171).opacity(isDark ? 0.24 : 0.30), lineWidth: 1))
    }

    // MARK: Favourite button

    @ViewBuilder
    func favoriteButtonGlass(isDark: Bool) -> some View {
        self
            .background(
                isDark ? Color.black.opacity(0.22) : Color.black.opacity(0.04),
                in: Circle()
            )
            .overlay(
                Circle().stroke(
                    isDark ? Color.white.opacity(0.10) : Color.black.opacity(0.10),
                    lineWidth: 1
                )
            )
    }

    // MARK: Stat cards

    @ViewBuilder
    func statCardGlass(isDark: Bool) -> some View {
        self
            .background(
                isDark ? Color.black.opacity(0.20) : Color.white.opacity(0.92),
                in: RoundedRectangle(cornerRadius: 14, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.08), lineWidth: 1)
            )
    }

    // MARK: Feature pills

    @ViewBuilder
    func featurePillGlass(tint: Color, isDark: Bool) -> some View {
        self
            .background(tint.opacity(isDark ? 0.10 : 0.15), in: Capsule())
            .overlay(Capsule().stroke(tint.opacity(isDark ? 0.22 : 0.30), lineWidth: 1))
    }

    // MARK: Info cards (permitInfo + notes)

    @ViewBuilder
    func infoCardGlass(isDark: Bool) -> some View {
        self
            .background(
                isDark ? Color.black.opacity(0.20) : Color.white.opacity(0.94),
                in: RoundedRectangle(cornerRadius: 14, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.08), lineWidth: 1)
            )
    }

    // MARK: Forecast chart container

    @ViewBuilder
    func forecastCardGlass(isDark: Bool) -> some View {
        self
            .background(
                isDark ? Color.black.opacity(0.20) : Color.white.opacity(0.96),
                in: RoundedRectangle(cornerRadius: 14, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.08), lineWidth: 1)
            )
    }

    // MARK: Park Here button

    @ViewBuilder
    func parkButtonGlass() -> some View {
        self
            .background(Color(hex: 0xCC0033), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    // MARK: Navigate button

    @ViewBuilder
    func navigateButtonGlass(isDark: Bool) -> some View {
        self
            .background(
                Color(hex: 0x60A5FA).opacity(isDark ? 0.08 : 0.12),
                in: RoundedRectangle(cornerRadius: 16, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color(hex: 0x60A5FA).opacity(isDark ? 0.22 : 0.30), lineWidth: 1)
            )
    }
}
