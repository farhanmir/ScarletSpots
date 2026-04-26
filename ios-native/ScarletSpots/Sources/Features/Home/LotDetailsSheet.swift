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

    @StateObject private var webSocket = WebSocketManager.shared
    @StateObject private var session = NativeSessionStore.shared

    @State private var parking = false
    @State private var forecast: [ForecastPoint] = []
    @State private var toastText: String?

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                headerSection
                statsRow
                featurePills
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
        }
        .background(
            LinearGradient(
                colors: [Color(hex: 0x0A0C12), Color(hex: 0x111725)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
        )
        .task {
            await loadForecast()
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
            statCard(value: "\(liveOccupancy)", label: "Sessions", color: .white)
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
        }
        .padding(14)
        .background(Color.black.opacity(0.20), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 1))
    }

    private var forecastSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 0) {
                ForEach(["12AM", "Now", "1AM", "2AM", "3AM"], id: \.self) { label in
                    VStack(spacing: 7) {
                        Text(label)
                            .font(.caption2.weight(label == "Now" ? .bold : .regular))
                            .foregroundStyle(label == "Now" ? .white : .white.opacity(0.45))
                        Circle()
                            .fill(NativeAuthColors.occupancyLow.opacity(label == "Now" ? 0.95 : 0.75))
                            .frame(width: 7, height: 7)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            ForecastChart(points: forecast, capacity: displayCapacity)
                .padding(12)
                .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.white.opacity(0.10), lineWidth: 1))
        }
        .padding(.top, 10)
    }

    private var actionButtons: some View {
        HStack(spacing: 10) {
            Button {
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
                .background(isCurrentlyParkedHere ? Color.gray : Color(hex: 0xCC0033), in: RoundedRectangle(cornerRadius: 16))
                .shadow(color: (isCurrentlyParkedHere ? Color.clear : Color(hex: 0xCC0033)).opacity(0.3), radius: 8, y: 4)
            }
            .disabled(parking || isCurrentlyParkedHere)

            Button {
                openDirections()
            } label: {
                Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Color(hex: 0x60A5FA))
                    .frame(width: 54, height: 54)
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

    private var isCurrentlyParkedHere: Bool {
        session.activeSession?.lotId == lot.mapId
    }

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
            toastText = "Session started."
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
