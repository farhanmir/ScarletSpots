import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
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
  const labelBaseTime = Date.now();
  const getLabelForIndex = (index: number) =>
    formatTime(
      new Date(
        labelBaseTime + (index - NOW_INDEX) * FORECAST_STEP_MINUTES * 60000,
      ).toISOString(),
    );

  return (
    <View style={styles.wrapper}>
      {isLoading ? (
        <ActivityIndicator size="small" color="#52525b" />
      ) : curve.length > 0 ? (
        <View style={styles.row}>
          {curve.map((point: ForecastPoint, index: number) => {
            const isNow = index === NOW_INDEX; // Curve: -60, -30, 0(now), +30, +60, …
            const occ = Math.max(0, Math.min(100, point.expected_occupancy));
            const barHeight = Math.max(6, (occ / 100) * MAX_BAR_HEIGHT);
            const color = getOccupancyGradientColor(occ);
            const currentTimeLabel = getLabelForIndex(index);
            const showLabel =
              isNow ||
              index === 0 ||
              (index > 0 && getLabelForIndex(index - 1) !== currentTimeLabel);

            return (
              <View key={index} style={styles.item}>
                <Text style={[styles.label, isNow && styles.nowLabel]}>
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
        <Text style={styles.empty}>Forecast unavailable</Text>
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
    color: "#71717a",
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
  },
  nowLabel: {
    color: "#ffffff",
    fontWeight: "700",
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
    color: "#71717a",
    fontSize: 12,
    textAlign: "center",
  },
});
