import SwiftUI

/// Soft-outlined occupancy chip used in the search list, lot details, and any
/// other surface that needs to convey a lot's current occupancy at a glance.
///
/// Mirrors the `OccupancyPill` component from
/// `mobile/src/features/home/screens/SearchScreen.tsx` — a colored dot plus
/// `"<rate>%"` text on a translucent background, with the same threshold
/// palette (`>= 90` red, `>= 70` amber, else green).
struct OccupancyPill: View {
    /// Occupancy rate as a percentage (0 – 100).
    let rate: Double
    /// Whether the underlying number was estimated by a heuristic.
    /// When true the pill renders `~X%` instead of `X%`, matching the
    /// convention used by the map markers.
    var isEstimated: Bool = false

    var body: some View {
        let color = OccupancyPalette.color(for: rate)
        let percent = Int(rate.rounded())
        let label = isEstimated ? "~\(percent)%" : "\(percent)%"

        HStack(spacing: 5) {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)
            Text(label)
                .font(.system(size: 12, weight: .bold).monospacedDigit())
                .foregroundStyle(color)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            color.opacity(0.10),
            in: RoundedRectangle(cornerRadius: 8, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(color.opacity(0.25), lineWidth: 1)
        )
        .accessibilityLabel("\(percent) percent occupied")
    }
}

/// Shared occupancy color helper so map pills, polygons, search rows, and
/// any future lot-status UI all agree on the threshold palette.
enum OccupancyPalette {
    /// Returns the brand color matching `rate` (0 – 100).
    /// `>= 90` → red, `>= 70` → amber, else green.
    static func color(for rate: Double) -> Color {
        if rate >= 90 { return NativeAuthColors.occupancyHigh }
        if rate >= 70 { return NativeAuthColors.occupancyMedium }
        return NativeAuthColors.occupancyLow
    }

    /// Same thresholds expressed as a 0 – 1 ratio. Used by the map's
    /// per-lot color helper that already operates on `count / capacity`.
    static func color(forRatio ratio: Double) -> Color {
        color(for: ratio * 100)
    }

    /// Cluster variant — slightly darker green at low occupancy to match
    /// `getClusterColor` in the React Native HomeScreen.
    static func clusterColor(for rate: Double) -> Color {
        if rate > 80 { return NativeAuthColors.occupancyHigh }
        if rate > 50 { return NativeAuthColors.occupancyMedium }
        return NativeAuthColors.clusterLow
    }
}
