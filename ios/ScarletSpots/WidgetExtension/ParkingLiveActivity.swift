import ActivityKit
import SwiftUI
import WidgetKit

struct ParkingLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ParkingAttributes.self) { context in
            parkingLockScreenView(state: context.state)
                .activityBackgroundTint(Color.black.opacity(0.6))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        Image(systemName: "parkingsign.circle.fill")
                            .foregroundStyle(.red)
                        Text(context.state.lotName)
                            .font(.headline)
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing) {
                        Text(context.state.distance)
                            .font(.subheadline.bold())
                        Text("to car")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 2) {
                        if let sub = context.state.deckLevelSubtitle, !sub.isEmpty {
                            Text(sub)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                        }
                        Text("Parked \(context.state.startedAt, style: .relative) ago")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            } compactLeading: {
                Image(systemName: "parkingsign.circle.fill")
                    .foregroundStyle(.red)
            } compactTrailing: {
                Text(context.state.distance)
                    .font(.caption.monospacedDigit())
                    .lineLimit(1)
            } minimal: {
                Image(systemName: "parkingsign")
                    .foregroundStyle(.red)
            }
            .widgetURL(URL(string: "scarletspots://session/active"))
        }
    }

    @ViewBuilder
    private func parkingLockScreenView(state: ParkingAttributes.ContentState) -> some View {
        HStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(Color.red.opacity(0.15))
                    .frame(width: 44, height: 44)
                Image(systemName: "parkingsign.circle.fill")
                    .font(.title2)
                    .foregroundStyle(.red)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(state.lotName)
                    .font(.headline)
                    .lineLimit(1)
                if let sub = state.deckLevelSubtitle, !sub.isEmpty {
                    Text(sub)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                Text("Parked \(state.startedAt, style: .relative) ago")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing) {
                Text(state.distance)
                    .font(.title3.bold())
                Text("to car")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
    }
}

@main
struct ScarletSpotsWidgetBundle: WidgetBundle {
    var body: some Widget {
        ParkingLiveActivity()
    }
}
