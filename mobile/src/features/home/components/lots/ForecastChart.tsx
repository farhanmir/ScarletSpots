import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { ForecastPoint } from "@/features/home/types/types";
import { getOccupancyColor, formatTime } from "@/features/home/services/utils";

interface ForecastChartProps {
  curve: ForecastPoint[];
  isLoading: boolean;
}

const DOT_SIZE = 9;

export default function ForecastChart({
  curve,
  isLoading,
}: ForecastChartProps) {
  return (
    <View style={styles.wrapper}>
      {isLoading ? (
        <ActivityIndicator size="small" color="#52525b" />
      ) : curve.length > 0 ? (
        <View style={styles.row}>
          {/* Thin connecting line centred on the dots */}
          <View style={styles.line} />

          {curve.map((point: ForecastPoint, index: number) => {
            const isNow = index === 2; // Curve: -60, -30, 0(now), +30, +60, …
            const color = getOccupancyColor(point.expected_occupancy);
            const currentTimeLabel = formatTime(point.time);
            const showLabel =
              isNow ||
              index === 0 ||
              (index > 0 &&
                formatTime(curve[index - 1].time) !== currentTimeLabel);

            return (
              <View key={index} style={styles.item}>
                <Text style={[styles.label, isNow && styles.nowLabel]}>
                  {isNow ? "Now" : showLabel ? currentTimeLabel : ""}
                </Text>
                <View style={[styles.dot, { backgroundColor: color }]} />
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.empty}>Forecast unavailable</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 8,
    marginTop: 4,
    minHeight: 44,
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    position: "relative",
    paddingHorizontal: 4,
  },
  // Horizontal connector — sits at the vertical centre of the dots
  line: {
    position: "absolute",
    left: 4,
    right: 4,
    bottom: Math.floor(DOT_SIZE / 2) - 1,
    height: 1.5,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 1,
  },
  item: {
    flex: 1,
    alignItems: "center",
    gap: 7,
  },
  label: {
    color: "#71717a",
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
  },
  nowLabel: {
    color: "#ffffff",
    fontWeight: "700",
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: Math.ceil(DOT_SIZE / 2),
  },
  empty: {
    color: "#71717a",
    fontSize: 12,
    textAlign: "center",
  },
});
