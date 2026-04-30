import SwiftUI
import CoreLocation
import UIKit

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
                    ContentUnavailableView("Couldn't load Discover", systemImage: "fork.knife") {
                        Text(error).font(.footnote)
                    } actions: {
                        Button("Try Again") { Task { await loadSponsors() } }
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
                        .onAppear {
                            guard !trackedImpressions.contains(sponsor.id) else { return }
                            trackedImpressions.insert(sponsor.id)
                            Task {
                                try? await SponsorsAPI.trackEvent(sponsorId: sponsor.id, eventType: "impression_discover")
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
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
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(sponsor.name)
                    .font(.headline)
                Spacer()
                Text("Sponsored")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.red)
            }
            Text(sponsor.category)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text(sponsor.promoText)
                .font(.footnote)
                .foregroundStyle(.primary)
                .lineLimit(2)
            HStack {
                Text("Code: \(sponsor.promoCode)")
                if let distance = sponsor.distanceMeters {
                    Text("• \(distanceLabel(distance))")
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
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
            VStack(alignment: .leading, spacing: 14) {
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

                VStack(alignment: .leading, spacing: 4) {
                    Text("Offer").font(.headline)
                    Text(sponsor.promoText)
                    Text("Use code: \(sponsor.promoCode)")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.red)
                }

                HStack(spacing: 12) {
                    if let url = URL(string: sponsor.websiteURL) {
                        Button("Website") {
                            openURL(url)
                            Task {
                                try? await SponsorsAPI.trackEvent(sponsorId: sponsor.id, eventType: "website_click")
                            }
                        }
                            .buttonStyle(.borderedProminent)
                    }
                    if let url = URL(string: "tel://\(digitsOnly(sponsor.phone))") {
                        Button("Call") {
                            openURL(url)
                            Task {
                                try? await SponsorsAPI.trackEvent(sponsorId: sponsor.id, eventType: "call_click")
                            }
                        }
                            .buttonStyle(.bordered)
                    }
                    Button("Copy Code") {
                        UIPasteboard.general.string = sponsor.promoCode
                        Task {
                            try? await SponsorsAPI.trackEvent(sponsorId: sponsor.id, eventType: "code_copy")
                        }
                    }
                    .buttonStyle(.bordered)
                }

                Button("Navigate") {
                    let path = "http://maps.apple.com/?daddr=\(sponsor.latitude),\(sponsor.longitude)"
                    if let url = URL(string: path) {
                        openURL(url)
                        Task {
                            try? await SponsorsAPI.trackEvent(sponsorId: sponsor.id, eventType: "navigate_click")
                        }
                    }
                }
                .buttonStyle(.bordered)

                Text("Why am I seeing this? This restaurant is a paid local sponsor near Rutgers parking areas.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
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
}
