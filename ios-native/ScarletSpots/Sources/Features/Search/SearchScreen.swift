import SwiftUI
import CoreLocation

/// Search result model used by the Search tab.
///
/// Three result kinds:
/// - `lot`  — a parking lot; tapping focuses the Map on the lot.
/// - `building` — a Rutgers building with known coordinates; tap centers
///   the map on it.
/// - `place` — a locations.json entry with no coordinates; we lazily
///   geocode on tap with `CLGeocoder`.
struct SearchResult: Identifiable, Hashable {
    enum Kind { case lot, building, place }
    let id: String
    let kind: Kind
    let title: String
    let subtitle: String
    let lotId: String?
    /// Optional — `place` kind entries don't carry coordinates.
    let coordinate: CLLocationCoordinate2D?
    let systemImage: String

    static func == (lhs: SearchResult, rhs: SearchResult) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

struct SearchScreen: View {
    @EnvironmentObject private var tabBarState: TabBarState
    @State private var query = ""
    @State private var results: [SearchResult] = []
    @State private var geocodingId: String?

    var body: some View {
        NavigationStack {
            Group {
                if results.isEmpty && !query.isEmpty {
                    ContentUnavailableView.search(text: query)
                } else if results.isEmpty {
                    ContentUnavailableView(
                        "Find a lot or building",
                        systemImage: "magnifyingglass",
                        description: Text("Try \"Busch\", \"Werblin\", or a specific lot number.")
                    )
                } else {
                    List {
                        ForEach(results) { result in
                            Button { select(result) } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: result.systemImage)
                                        .frame(width: 26)
                                        .foregroundStyle(result.kind == .lot ? .red : .secondary)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(result.title)
                                            .font(.body)
                                            .foregroundStyle(.primary)
                                        Text(result.subtitle)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(1)
                                    }
                                    Spacer(minLength: 8)
                                    if geocodingId == result.id {
                                        ProgressView().scaleEffect(0.8)
                                    } else {
                                        Image(systemName: "chevron.right")
                                            .font(.caption)
                                            .foregroundStyle(.tertiary)
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("\(result.title). \(result.subtitle)")
                            .accessibilityHint(
                                result.kind == .lot
                                    ? "Opens this lot on the map."
                                    : "Centers the map on this location."
                            )
                        }
                    }
                }
            }
            .navigationTitle("Search")
            .searchable(
                text: $query,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Lots, buildings, places"
            )
            .onChange(of: query) { _, newValue in
                runSearch(newValue)
            }
            .onAppear { runSearch("") }
        }
    }

    // MARK: - Actions

    private func select(_ result: SearchResult) {
        switch result.kind {
        case .lot:
            if let lotId = result.lotId {
                tabBarState.focusLotId = lotId
                tabBarState.selectedTab = 0
            }
        case .building:
            if let coord = result.coordinate {
                tabBarState.focusCoordinate = .init(
                    latitude: coord.latitude,
                    longitude: coord.longitude,
                    title: result.title
                )
                tabBarState.selectedTab = 0
            }
        case .place:
            if let coord = result.coordinate {
                tabBarState.focusCoordinate = .init(
                    latitude: coord.latitude,
                    longitude: coord.longitude,
                    title: result.title
                )
                tabBarState.selectedTab = 0
            } else {
                geocodeAndNavigate(result)
            }
        }
    }

    private func geocodeAndNavigate(_ result: SearchResult) {
        geocodingId = result.id
        let query = "\(result.title), \(result.subtitle)"
        CLGeocoder().geocodeAddressString(query) { placemarks, _ in
            Task { @MainActor in
                geocodingId = nil
                guard let location = placemarks?.first?.location else { return }
                tabBarState.focusCoordinate = .init(
                    latitude: location.coordinate.latitude,
                    longitude: location.coordinate.longitude,
                    title: result.title
                )
                tabBarState.selectedTab = 0
            }
        }
    }

    // MARK: - Search pipeline

    private func runSearch(_ term: String) {
        // Three-way FTS5 search against the bundled SQLite database. The
        // repositories handle empty/short-query fallbacks internally.
        let lotResults = LotRepository.shared
            .search(term, includeAllCampuses: FeatureFlags.enableAllCampuses, limit: 20)
            .map {
                SearchResult(
                    id: "lot:\($0.mapId)",
                    kind: .lot,
                    title: $0.shortName,
                    subtitle: "\($0.propertyName) · \($0.address.campus ?? "—")",
                    lotId: $0.mapId,
                    coordinate: CLLocationCoordinate2D(latitude: $0.location.lat, longitude: $0.location.lng),
                    systemImage: "parkingsign.circle.fill"
                )
            }

        let buildingResults = BuildingRepository.search(term, limit: 15).map {
            SearchResult(
                id: "bldg:\($0.name)",
                kind: .building,
                title: $0.name,
                subtitle: $0.address,
                lotId: nil,
                coordinate: CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude),
                systemImage: "building.2.fill"
            )
        }

        let placeResults = PlacesRepository.search(term, limit: 8).map {
            SearchResult(
                id: "place:\($0.id)",
                kind: .place,
                title: $0.name,
                subtitle: $0.address,
                lotId: nil,
                coordinate: nil,
                systemImage: "mappin.circle.fill"
            )
        }

        // De-dup places that share a name with a building we already have.
        let existingNames = Set(buildingResults.map { $0.title.lowercased() })
        let uniquePlaces = placeResults.filter { !existingNames.contains($0.title.lowercased()) }

        results = lotResults + buildingResults + uniquePlaces
    }
}
