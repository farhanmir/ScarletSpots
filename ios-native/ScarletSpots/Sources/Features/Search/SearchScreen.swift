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
    /// Carried for `lot` kind results so the row can render live occupancy
    /// + capacity without a second lookup.
    let lot: Lot?

    init(
        id: String,
        kind: Kind,
        title: String,
        subtitle: String,
        lotId: String?,
        coordinate: CLLocationCoordinate2D?,
        systemImage: String,
        lot: Lot? = nil
    ) {
        self.id = id
        self.kind = kind
        self.title = title
        self.subtitle = subtitle
        self.lotId = lotId
        self.coordinate = coordinate
        self.systemImage = systemImage
        self.lot = lot
    }

    static func == (lhs: SearchResult, rhs: SearchResult) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

struct SearchScreen: View {
    @EnvironmentObject private var tabBarState: TabBarState
    @StateObject private var webSocket = WebSocketManager.shared
    @StateObject private var lotRepository = LotRepository.shared
    @State private var query = ""
    @State private var results: [SearchResult] = []
    @State private var geocodingId: String?

    var body: some View {
        NavigationStack {
            Group {
                if !query.isEmpty {
                    if results.isEmpty {
                        ContentUnavailableView.search(text: query)
                    } else {
                        searchResultsList
                    }
                } else {
                    browseList
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

    // MARK: - Lists

    private var searchResultsList: some View {
        List {
            Section {
                ForEach(results) { result in
                    rowButton(for: result)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    /// Default state shown when the search field is empty: a "Popular Lots"
    /// section so users have somewhere to go without typing.
    private var browseList: some View {
        List {
            Section {
                ForEach(popularResults) { result in
                    rowButton(for: result)
                }
            } header: {
                Text("Popular Lots")
                    .font(.caption.weight(.semibold))
                    .kerning(0.6)
                    .foregroundStyle(.secondary)
            } footer: {
                Text("Try \"Busch\", \"Werblin\", or a specific lot number to search further.")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .listStyle(.insetGrouped)
    }

    private func rowButton(for result: SearchResult) -> some View {
        Button { select(result) } label: {
            SearchRow(
                result: result,
                occupancy: result.lot.flatMap { webSocket.lotOccupancies[$0.mapId] },
                isGeocoding: geocodingId == result.id
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(rowAccessibilityLabel(for: result))
        .accessibilityHint(
            result.kind == .lot
                ? "Opens this lot on the map."
                : "Centers the map on this location."
        )
    }

    private func rowAccessibilityLabel(for result: SearchResult) -> String {
        if let lot = result.lot, let occupancy = webSocket.lotOccupancies[lot.mapId] {
            let percent = Int((Double(occupancy) / Double(max(lot.totalSpaces, 1)) * 100).rounded())
            return "\(result.title), \(result.subtitle), \(percent) percent occupied."
        }
        return "\(result.title). \(result.subtitle)"
    }

    // MARK: - Actions

    private func select(_ result: SearchResult) {
        switch result.kind {
        case .lot:
            if let lotId = result.lotId {
                tabBarState.focusLotId = lotId
                tabBarState.selectedTab = 1
            }
        case .building:
            if let coord = result.coordinate {
                tabBarState.focusCoordinate = .init(
                    latitude: coord.latitude,
                    longitude: coord.longitude,
                    title: result.title
                )
                tabBarState.selectedTab = 1
            }
        case .place:
            if let coord = result.coordinate {
                tabBarState.focusCoordinate = .init(
                    latitude: coord.latitude,
                    longitude: coord.longitude,
                    title: result.title
                )
                tabBarState.selectedTab = 1
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
                tabBarState.selectedTab = 1
            }
        }
    }

    // MARK: - Search pipeline

    private func runSearch(_ term: String) {
        // Three-way FTS5 search against the bundled SQLite database. The
        // repositories handle empty/short-query fallbacks internally.
        let lotResults = LotRepository.shared
            .search(term, includeAllCampuses: FeatureFlags.enableAllCampuses, limit: 20)
            .map { lotResult($0) }

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

    /// Default browse list. Mirrors `STATIC_LOTS.slice(0, 6)` from the React
    /// Native Search screen — see `docs/popular-lots.md` for the proposed
    /// future ranking that replaces this static fallback with real usage
    /// data.
    private var popularResults: [SearchResult] {
        let lots = lotRepository.getAll(includeAllCampuses: FeatureFlags.enableAllCampuses)
        return Array(lots.prefix(6)).map { lotResult($0) }
    }

    private func lotResult(_ lot: Lot) -> SearchResult {
        SearchResult(
            id: "lot:\(lot.mapId)",
            kind: .lot,
            title: lot.shortName,
            subtitle: lotSubtitle(for: lot),
            lotId: lot.mapId,
            coordinate: CLLocationCoordinate2D(latitude: lot.location.lat, longitude: lot.location.lng),
            systemImage: "car.fill",
            lot: lot
        )
    }

    /// Subtitle in the screenshot shape: "<campus> · <totalSpaces> spots".
    /// Falls back gracefully when the campus label is missing.
    private func lotSubtitle(for lot: Lot) -> String {
        let campus = lot.address.campus ?? "Rutgers"
        let spots = lot.totalSpaces
        let plural = spots == 1 ? "spot" : "spots"
        return "\(campus) · \(spots) \(plural)"
    }
}

// MARK: - Search row

/// Single search list row.
///
/// `lot` results render the rich variant from
/// `mobile/src/features/home/screens/SearchScreen.tsx` (icon tile + name +
/// campus/capacity subtitle + trailing `OccupancyPill`). Building / place
/// results keep the simpler one-line layout with a chevron.
private struct SearchRow: View {
    let result: SearchResult
    let occupancy: Int?
    let isGeocoding: Bool

    var body: some View {
        HStack(spacing: 12) {
            iconTile

            VStack(alignment: .leading, spacing: 3) {
                Text(result.title)
                    .font(.system(size: 15, weight: result.kind == .lot ? .bold : .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Text(result.subtitle)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            trailing
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private var iconTile: some View {
        if result.kind == .lot {
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color.primary.opacity(0.06))
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.primary.opacity(0.10), lineWidth: 0.5)
                Image(systemName: "car.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            .frame(width: 48, height: 48)
        } else {
            Image(systemName: result.systemImage)
                .font(.system(size: 18))
                .frame(width: 48, height: 48)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var trailing: some View {
        if isGeocoding {
            ProgressView().scaleEffect(0.8)
        } else if result.kind == .lot, let lot = result.lot {
            let capacity = max(lot.totalSpaces, 1)
            let rate = Double(occupancy ?? 0) / Double(capacity) * 100
            OccupancyPill(rate: min(100, rate))
        } else {
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
    }
}
