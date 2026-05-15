import SwiftUI
import MapKit

/// Floating chip shown on the Map while a parking session is active.
///
/// Shows the resolved lot name (falling back to the raw `lotId`) and the
/// elapsed duration since the session started. Tapping "End" sends the end
/// request, falling back to the offline queue if needed.
struct ActiveSessionChip: View {
    let session: ParkingSession
    @StateObject private var lotRepository = LotRepository.shared
    @StateObject private var location = LocationEngine.shared
    @State private var ending = false
    @State private var showEndConfirm = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                Circle()
                    .fill(Color.red)
                    .frame(width: 8, height: 8)
                Text(lotTitle)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .layoutPriority(1)

                if let findCarState {
                    Divider()
                        .frame(height: 16)
                        .overlay(Color.primary.opacity(0.20))
                    Button(action: openDirectionsToCar) {
                        HStack(spacing: 6) {
                            Image(systemName: "location.north.fill")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Color.blue)
                                .rotationEffect(.degrees(findCarState.arrowRotation))
                                .frame(width: 20, height: 20)
                            Text(findCarState.distanceText)
                                .font(.system(size: 13, weight: .semibold).monospacedDigit())
                                .foregroundStyle(Color.blue)
                                .lineLimit(1)
                                .fixedSize(horizontal: true, vertical: false)
                        }
                    }
                    .buttonStyle(.plain)
                }

                HStack { EmptyView() }.frame(width: 6)
                Button {
                    guard !ending else { return }
                    HapticManager.shared.softImpact()
                    showEndConfirm = true
                } label: {
                    Text(ending ? "Ending…" : "End")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(Color.red)
                        .padding(.horizontal, 2)
                }
                .buttonStyle(.plain)
                .disabled(ending)
                .accessibilityLabel(ending ? "Ending session" : "End parking session")
            }

            if let line = sessionDeckLine {
                Text(line)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            } else if let suggested = inferredDeckLabel {
                HStack(spacing: 8) {
                    Text("Suggested: \(suggested)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Button("Use") {
                        Task { await applyDeckSuggestion(label: suggested) }
                    }
                    .font(.caption2.bold())
                    .buttonStyle(.borderless)
                }
            }
        }
        .padding(.vertical, 11)
        .padding(.horizontal, 16)
        .activeSessionGlass()
        .shadow(color: Color.red.opacity(0.22), radius: 12, y: 4)
        .fixedSize(horizontal: true, vertical: false)
        .frame(maxWidth: 320)
        .padding(.horizontal, 14)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Active parking session at \(lotTitle)")
        .confirmationDialog(
            "End parking session?",
            isPresented: $showEndConfirm,
            titleVisibility: .visible
        ) {
            Button("End Session", role: .destructive) { endSession() }
            Button("Keep Parked", role: .cancel) {}
        } message: {
            Text("This marks you as no longer parked in \(lotTitle).")
        }
    }

    private var sessionDeckLine: String? {
        guard let raw = session.deckLevelLabel?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else { return nil }
        return "Level \(raw)"
    }

    private var inferredDeckLabel: String? {
        guard let lot = lotRepository.byId(session.lotId), lot.shouldPromptForDeckLevel else { return nil }
        let existing = session.deckLevelLabel?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard existing.isEmpty else { return nil }
        return DeckLevelCalibration.suggestedLabel(lotId: session.lotId, location: location.latestLocation)
    }

    private func applyDeckSuggestion(label: String) async {
        let key = DeckLevelNormalizer.normalizedKey(from: label)
        do {
            try await ParkAPI.patchActiveSession(deckLevelLabel: label, deckLevelKey: key)
            await NativeSessionStore.shared.refresh()
            HapticManager.shared.success()
        } catch {
            HapticManager.shared.error()
        }
    }

    private func endSession() {
        guard !ending else { return }
        ending = true
        Task {
            let key = "end_\(session.id.uuidString)"
            do {
                try await ParkAPI.endSession(source: "manual", idempotencyKey: key)
                await NativeSessionStore.shared.refresh()
                HapticManager.shared.success()
            } catch {
                await OfflineQueue.shared.enqueue(
                    type: "END_SESSION",
                    endpoint: "park/session/end",
                    payload: try? JSONSerialization.data(withJSONObject: ["source": "manual"]),
                    idempotencyKey: key
                )
                HapticManager.shared.warning()
            }
            ending = false
        }
    }

    private var lotTitle: String {
        if let lot = lotRepository.byId(session.lotId) { return lot.shortName }
        return "Parked in \(session.lotId)"
    }

    private var currentCoordinate: CLLocationCoordinate2D? {
        location.latestLocation?.coordinate
    }

    private var targetCoordinate: CLLocationCoordinate2D? {
        if let lat = session.latitude, let lng = session.longitude {
            return CLLocationCoordinate2D(latitude: lat, longitude: lng)
        }
        if let lot = lotRepository.byId(session.lotId) {
            return lot.location.clLocationCoordinate2D
        }
        return nil
    }

    private var findCarState: (distanceText: String, arrowRotation: Double)? {
        guard let target = targetCoordinate else { return nil }
        guard let user = currentCoordinate else { return (distanceText: "—", arrowRotation: 0) }

        if session.latitude == nil || session.longitude == nil,
           let lot = lotRepository.byId(session.lotId),
           isInsideLot(user, lot: lot) {
            // RN parity: for remote-park fallback, stop pointing once inside lot boundary.
            return nil
        }

        let meters = CLLocation(latitude: user.latitude, longitude: user.longitude)
            .distance(from: CLLocation(latitude: target.latitude, longitude: target.longitude))
        let feet = meters * 3.28084
        let distanceText: String
        if feet < 1000 {
            distanceText = "\(Int(feet.rounded())) ft"
        } else {
            let miles = feet / 5280
            if miles < 10 {
                distanceText = String(format: "%.1f mi", miles)
            } else {
                distanceText = "\(Int(miles.rounded())) mi"
            }
        }
        let bearing = bearingDegrees(from: user, to: target)
        let heading = currentHeading
        let arrowRotation = (bearing - heading + 360).truncatingRemainder(dividingBy: 360)
        return (distanceText: distanceText, arrowRotation: arrowRotation)
    }

    private var currentHeading: Double {
        if let heading = location.latestHeading, heading >= 0 { return heading }
        if let course = location.latestLocation?.course, course >= 0 { return course }
        return 0
    }

    private func bearingDegrees(from start: CLLocationCoordinate2D, to end: CLLocationCoordinate2D) -> Double {
        let startLat = start.latitude * .pi / 180
        let startLng = start.longitude * .pi / 180
        let endLat = end.latitude * .pi / 180
        let endLng = end.longitude * .pi / 180
        let dLng = endLng - startLng

        let y = sin(dLng) * cos(endLat)
        let x = cos(startLat) * sin(endLat) - sin(startLat) * cos(endLat) * cos(dLng)
        let radians = atan2(y, x)
        return (radians * 180 / .pi + 360).truncatingRemainder(dividingBy: 360)
    }

    private func isInsideLot(_ coordinate: CLLocationCoordinate2D, lot: Lot) -> Bool {
        lot.polygons.contains { ring in
            GeometryMath.pointInPolygon(coordinate, polygon: ring.outer)
                && !ring.holes.contains(where: { GeometryMath.pointInPolygon(coordinate, polygon: $0) })
        }
    }

    private func openDirectionsToCar() {
        guard let target = targetCoordinate else { return }
        let mapItem = MKMapItem(placemark: MKPlacemark(coordinate: target))
        mapItem.name = (session.latitude != nil && session.longitude != nil) ? "My Car" : lotTitle
        mapItem.openInMaps(launchOptions: [
            MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeWalking
        ])
    }
}

private extension View {
    @ViewBuilder
    func activeSessionGlass() -> some View {
        if #available(iOS 26.0, *) {
            self
                .glassEffect(in: Capsule())
                .overlay(
                    Capsule().stroke(Color.red.opacity(0.40), lineWidth: 1)
                )
        } else {
            self
                .background(.ultraThinMaterial, in: Capsule())
                .overlay(
                    Capsule().stroke(Color.red.opacity(0.40), lineWidth: 1)
                )
        }
    }
}
