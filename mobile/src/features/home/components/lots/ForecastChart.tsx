import React, { useMemo } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useResolvedColorScheme } from "@/shared/hooks/use-resolved-color-scheme";
import { ForecastPoint } from "@/features/home/types/types";
import {
  getOccupancyGradientColor,
  formatTime,
} from "@/features/home/services/utils";

interface ForecastChartProps {
  curve: ForecastPoint[];
  isLoading: boolean;
}

const MAX_BAR_HEIGHT = 36;
const BAR_WIDTH = 8;
const NOW_INDEX = 2;
const FORECAST_STEP_MINUTES = 30;

export default function ForecastChart({
  curve,
  isLoading,
}: ForecastChartProps) {
  const mode = useResolvedColorScheme();
  const isDark = mode === "dark";

  const labelBaseTime = useMemo(() => {
    const now = new Date();
    now.setSeconds(0, 0);
    const minutes = now.getMinutes();
    // Snap timeline to nearest half-hour:
    // :00–:14 => :00, :15–:44 => :30, :45–:59 => next hour :00.
    if (minutes < 15) now.setMinutes(0);
    else if (minutes < 45) now.setMinutes(30);
    else {
      now.setHours(now.getHours() + 1);
      now.setMinutes(0);
    }
    return now.getTime();
  }, []);

  const getPointDateForIndex = (index: number) =>
    new Date(
      labelBaseTime + (index - NOW_INDEX) * FORECAST_STEP_MINUTES * 60000,
    );

  return (
    <View style={styles.wrapper}>
      {isLoading ? (
        <ActivityIndicator size="small" color={isDark ? "#52525b" : "#a1a1aa"} />
      ) : curve.length > 0 ? (
        <View style={styles.row}>
          {curve.map((point: ForecastPoint, index: number) => {
            const isNow = index === NOW_INDEX; // Curve: -60, -30, 0(now), +30, +60, …
            const occ = Math.max(0, Math.min(100, point.expected_occupancy));
            const barHeight = Math.max(6, (occ / 100) * MAX_BAR_HEIGHT);
            const color = getOccupancyGradientColor(occ);
            const pointDate = getPointDateForIndex(index);
            const currentTimeLabel = formatTime(pointDate.toISOString());
            const showLabel = isNow || pointDate.getMinutes() === 0;
            const labelColor = isNow
              ? isDark ? "#ffffff" : "#111111"
              : isDark ? "#71717a" : "#a1a1aa";

            return (
              <View key={index} style={styles.item}>
                <Text
                  style={[
                    styles.label,
                    { color: labelColor, fontWeight: isNow ? "700" : "500" },
                  ]}
                >
                  {isNow ? "Now" : showLabel ? currentTimeLabel : ""}
                </Text>
                <View style={styles.barContainer}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: barHeight,
                        backgroundColor: color,
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={[styles.empty, { color: isDark ? "#71717a" : "#a1a1aa" }]}>Forecast unavailable</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    minHeight: 56,
    justifyContent: "flex-end",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 4,
  },
  item: {
    flex: 1,
    alignItems: "center",
    gap: 7,
  },
  label: {
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
  },
  barContainer: {
    width: BAR_WIDTH,
    height: MAX_BAR_HEIGHT,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: 4,
    minHeight: 6,
  },
  empty: {
    fontSize: 12,
    textAlign: "center",
  },
});
