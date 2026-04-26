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
        HStack(spacing: 10) {
            Circle()
                .fill(Color.red)
                .frame(width: 8, height: 8)
            Text(lotTitle)
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(.primary)
                .lineLimit(1)

            if let findCarState {
                Divider()
                    .frame(height: 14)
                    .overlay(Color.primary.opacity(0.20))
                Button(action: openDirectionsToCar) {
                    HStack(spacing: 5) {
                        Image(systemName: "location.north.fill")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Color.blue)
                            .rotationEffect(.degrees(findCarState.arrowRotation))
                        Text(findCarState.distanceText)
                            .font(.system(size: 16, weight: .semibold).monospacedDigit())
                            .foregroundStyle(Color.blue)
                    }
                }
                .buttonStyle(.plain)
            }

            Spacer(minLength: 8)
            Button {
                guard !ending else { return }
                showEndConfirm = true
            } label: {
                Text(ending ? "Ending…" : "End")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Color.red)
                    .padding(.horizontal, 2)
            }
            .buttonStyle(.plain)
            .disabled(ending)
            .accessibilityLabel(ending ? "Ending session" : "End parking session")
        }
        .padding(.vertical, 9)
        .padding(.horizontal, 12)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(
            Capsule().stroke(Color.red.opacity(0.25), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.18), radius: 6, y: 2)
        .frame(maxWidth: 350)
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

    private func endSession() {
        guard !ending else { return }
        ending = true
        Task {
            let key = "end_\(session.id.uuidString)"
            do {
                try await ParkAPI.endSession(idempotencyKey: key)
                await NativeSessionStore.shared.refresh()
            } catch {
                await OfflineQueue.shared.enqueue(
                    type: "END_SESSION",
                    endpoint: "park/session/end",
                    payload: nil,
                    idempotencyKey: key
                )
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
        let distanceText = feet < 500 ? "\(Int(feet.rounded())) ft" : "\(Int(meters.rounded())) m"
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
