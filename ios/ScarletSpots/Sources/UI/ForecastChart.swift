import SwiftUI
import Charts

/// Compact bar-chart forecast view used in `LotDetailsSheet`.
///
/// Each bar represents a predicted occupancy slice (now / 15m / 30m / 60m).
/// Heights are normalized to the max count in the dataset so a lot with
/// small absolute numbers still renders a readable chart. Colors shift
/// red as occupancy-rate approaches 1.0.
struct ForecastChart: View {
    let points: [ForecastPoint]
    let capacity: Int

    var body: some View {
        if points.isEmpty {
            emptyState
        } else {
            Chart(Array(points.prefix(8))) { point in
                let normalized = ratio(for: point)
                BarMark(
                    x: .value("Time", point.label),
                    y: .value("Occupancy", point.count)
                )
                .foregroundStyle(colorForRatio(normalized))
                .cornerRadius(6)
            }
            .chartYAxis(.hidden)
            .chartLegend(.hidden)
            .chartXAxis {
                AxisMarks(values: .automatic(desiredCount: min(points.count, 6))) { value in
                    AxisValueLabel {
                        if let label = value.as(String.self) {
                            Text(label)
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(.white.opacity(0.64))
                        }
                    }
                }
            }
            .chartXScale(range: .plotDimension(padding: 18))
            .chartPlotStyle { plot in
                plot
                    .frame(maxWidth: .infinity)
                    .frame(height: 126)
                    .background(.clear)
            }
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

    private func ratio(for point: ForecastPoint) -> Double {
        if let rate = point.occupancyRate, rate > 0 {
            return min(1.0, max(0.0, rate / 100.0))
        }
        guard capacity > 0 else { return 0 }
        return min(1.0, Double(point.count) / Double(capacity))
    }

    private func colorForRatio(_ ratio: Double) -> Color {
        if ratio >= 0.9 { return Color(hex: 0xD86C72) }
        if ratio >= 0.7 { return Color(hex: 0xD89A6C) }
        if ratio >= 0.45 { return Color(hex: 0xD7BF6B) }
        return Color(hex: 0x70B98A)
    }
}
