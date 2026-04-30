import SwiftUI
import CoreLocation
import UIKit
import MapKit

struct DiscoverView: View {
    @StateObject private var location = LocationEngine.shared
    @State private var sponsors: [Sponsor] = []
    @State private var selectedSponsor: Sponsor?
    @State private var trackedImpressions: Set<String> = []
    @State private var error: String?
    @State private var isLoading = false

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && sponsors.isEmpty {
                    ProgressView()
                } else if let error {
                    VStack(spacing: 10) {
                        ContentUnavailableView("Couldn't load Discover", systemImage: "fork.knife")
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                        Button("Try Again") { Task { await loadSponsors() } }
                            .buttonStyle(.bordered)
                    }
                } else if sponsors.isEmpty {
                    ContentUnavailableView("No sponsors yet", systemImage: "fork.knife")
                } else {
                    List(sponsors) { sponsor in
                        Button {
                            selectedSponsor = sponsor
                            Task {
                                try? await SponsorsAPI.trackEvent(sponsorId: sponsor.id, eventType: "tap_card")
                            }
                        } label: {
                            SponsorRow(sponsor: sponsor)
                        }
                        .buttonStyle(.plain)
                        .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                        .onAppear {
                            guard !trackedImpressions.contains(sponsor.id) else { return }
                            trackedImpressions.insert(sponsor.id)
                            Task {
                                try? await SponsorsAPI.trackEvent(sponsorId: sponsor.id, eventType: "impression_discover")
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                    .scrollContentBackground(.hidden)
                    .refreshable { await loadSponsors() }
                }
            }
            .navigationTitle("Discover")
            .task { await loadSponsors() }
            .sheet(item: $selectedSponsor) { sponsor in
                SponsorDetailView(sponsor: sponsor)
                    .presentationDetents([.large])
            }
        }
    }

    private func loadSponsors() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let data: [Sponsor]
            if let current = location.latestLocation {
                data = try await SponsorsAPI.list(
                    latitude: current.coordinate.latitude,
                    longitude: current.coordinate.longitude
                )
            } else {
                data = try await SponsorsAPI.list()
            }
            sponsors = data
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct SponsorRow: View {
    let sponsor: Sponsor

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            AsyncImage(url: URL(string: sponsor.heroPhotoURL)) { image in
                image
                    .resizable()
                    .scaledToFill()
            } placeholder: {
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Color.secondary.opacity(0.12))
                    Image(systemName: "fork.knife")
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: 76, height: 76)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            VStack(alignment: .leading, spacing: 7) {
                HStack {
                    Text(sponsor.name)
                        .font(.headline)
                        .lineLimit(1)
                    Spacer()
                    Text("Sponsored")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.red)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color.red.opacity(0.08), in: Capsule())
                }
                Text(sponsor.category)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Text(sponsor.promoText)
                    .font(.footnote)
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                HStack {
                    Text("Code: \(sponsor.promoCode)")
                        .fontWeight(.semibold)
                        .foregroundStyle(.red)
                Spacer()
                    if let distance = sponsor.distanceMeters {
                        Text(distanceLabel(distance))
                            .foregroundStyle(.secondary)
                    }
                }
                .font(.caption)
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(uiColor: .secondarySystemGroupedBackground))
        )
    }

    private func distanceLabel(_ meters: Double) -> String {
        if meters < 1609 {
            return "\(Int(meters.rounded())) m"
        }
        return String(format: "%.1f mi", meters / 1609.34)
    }
}

private struct SponsorDetailView: View {
    @Environment(\.openURL) private var openURL
    let sponsor: Sponsor

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                AsyncImage(url: URL(string: sponsor.heroPhotoURL)) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    ZStack {
                        Rectangle().fill(Color.secondary.opacity(0.15))
                        Image(systemName: "photo").foregroundStyle(.secondary)
                    }
                }
                .frame(height: 200)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(alignment: .topLeading) {
                    Text("Sponsored")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.red)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(.ultraThinMaterial, in: Capsule())
                        .padding(10)
                }

                Text(sponsor.name)
                    .font(.title3.weight(.bold))
                Text(sponsor.category)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text(sponsor.about)
                    .font(.body)
                Text(sponsor.address)
                    .font(.footnote)
                    .foregroundStyle(.secondary)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Hours").font(.headline)
                    Text(hoursSummary)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Offer").font(.headline)
                    Text(sponsor.promoText)
                    HStack {
                        Text("Use code")
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text(sponsor.promoCode)
                            .font(.headline.weight(.bold))
                            .foregroundStyle(.red)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }

                VStack(spacing: 10) {
                    HStack(spacing: 10) {
                        if let url = URL(string: sponsor.websiteURL) {
                            Button {
                                openURL(url)
                                Task {
                                    try? await SponsorsAPI.trackEvent(sponsorId: sponsor.id, eventType: "website_click")
                                }
                            } label: {
                                Label("Website", systemImage: "safari")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                        }
                        if let url = URL(string: "tel://\(digitsOnly(sponsor.phone))") {
                            Button {
                                openURL(url)
                                Task {
                                    try? await SponsorsAPI.trackEvent(sponsorId: sponsor.id, eventType: "call_click")
                                }
                            } label: {
                                Label("Call", systemImage: "phone.fill")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                        }
                    }

                    HStack(spacing: 10) {
                        Button {
                            UIPasteboard.general.string = sponsor.promoCode
                            Task {
                                try? await SponsorsAPI.trackEvent(sponsorId: sponsor.id, eventType: "code_copy")
                            }
                        } label: {
                            Label("Copy Code", systemImage: "doc.on.doc")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)

                        Button {
                            openMaps()
                            Task {
                                try? await SponsorsAPI.trackEvent(sponsorId: sponsor.id, eventType: "navigate_click")
                            }
                        } label: {
                            Label("Navigate", systemImage: "map.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }

                Text("Why am I seeing this? This restaurant is a paid local sponsor near Rutgers parking areas.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.top, 4)
            }
            .padding(16)
        }
    }

    private var hoursSummary: String {
        [
            "Mon: \(joined(sponsor.hoursJSON.mon))",
            "Tue: \(joined(sponsor.hoursJSON.tue))",
            "Wed: \(joined(sponsor.hoursJSON.wed))",
            "Thu: \(joined(sponsor.hoursJSON.thu))",
            "Fri: \(joined(sponsor.hoursJSON.fri))",
            "Sat: \(joined(sponsor.hoursJSON.sat))",
            "Sun: \(joined(sponsor.hoursJSON.sun))",
        ].joined(separator: "\n")
    }

    private func joined(_ windows: [String]) -> String {
        windows.isEmpty ? "Closed" : windows.joined(separator: ", ")
    }

    private func digitsOnly(_ value: String) -> String {
        value.filter(\.isNumber)
    }

    private func openMaps() {
        let coordinate = CLLocationCoordinate2D(latitude: sponsor.latitude, longitude: sponsor.longitude)
        let placemark = MKPlacemark(coordinate: coordinate)
        let item = MKMapItem(placemark: placemark)
        item.name = sponsor.name
        item.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving])
    }
}
