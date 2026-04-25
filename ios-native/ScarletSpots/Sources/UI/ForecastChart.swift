import SwiftUI

/// Compact bar-chart forecast view used in `LotDetailsSheet`.
///
/// Each bar represents a predicted occupancy slice (now / 15m / 30m / 60m).
/// Heights are normalized to the max count in the dataset so a lot with
/// small absolute numbers still renders a readable chart. Colors shift
/// red as occupancy-rate approaches 1.0.
struct ForecastChart: View {
    let points: [ForecastPoint]
    let capacity: Int

    @State private var didAnimate = false

    private let maxHeight: CGFloat = 84

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Forecast").font(.headline)
            if points.isEmpty {
                emptyState
            } else {
                HStack(alignment: .bottom, spacing: 10) {
                    ForEach(points.prefix(8)) { point in
                        VStack(spacing: 6) {
                            Text("\(point.count)")
                                .font(.caption2.monospacedDigit())
                                .foregroundStyle(.secondary)
                            RoundedRectangle(cornerRadius: 5)
                                .fill(colorForRatio(ratio(for: point)))
                                .frame(width: 28, height: didAnimate ? normalizedHeight(for: point) : 0)
                                .animation(.easeOut(duration: 0.5), value: didAnimate)
                            Text(point.label)
                                .font(.system(size: 10).weight(.medium))
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .onAppear { didAnimate = true }
        .onChange(of: points.count) { _, _ in
            didAnimate = false
            DispatchQueue.main.async { didAnimate = true }
        }
    }

    private var emptyState: some View {
        HStack {
            Image(systemName: "chart.bar.fill")
                .foregroundStyle(.secondary)
            Text("No forecast data yet").font(.caption).foregroundStyle(.secondary)
        }
        .padding(.vertical, 8)
    }

    private var maxCount: Int {
        max(points.map(\.count).max() ?? 1, 1)
    }

    private func ratio(for point: ForecastPoint) -> Double {
        if let rate = point.occupancyRate, rate > 0 {
            return min(1.0, max(0.0, rate / 100.0))
        }
        guard capacity > 0 else { return 0 }
        return min(1.0, Double(point.count) / Double(capacity))
    }

    private func normalizedHeight(for point: ForecastPoint) -> CGFloat {
        let rate = ratio(for: point)
        // Use the higher of the occupancy ratio vs. relative-to-max so
        // charts never render as nothing at low absolute values.
        let relative = Double(point.count) / Double(maxCount)
        let height = max(rate, relative)
        return max(4, CGFloat(height) * maxHeight)
    }

    private func colorForRatio(_ ratio: Double) -> Color {
        if ratio > 0.9 { return .red }
        if ratio > 0.6 { return .orange }
        if ratio > 0.3 { return .yellow }
        return .green
    }
}
