import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { getOccupancyColor } from "@/features/home/services/utils";

interface OccupancyBadgeProps {
  rate: number;
  campus?: string;
}

export default function OccupancyBadge({ rate, campus }: OccupancyBadgeProps) {
  return (
    <View style={styles.badgeContainer}>
      <View
        style={[styles.badgeDot, { backgroundColor: getOccupancyColor(rate) }]}
      />
      {campus && <Text style={styles.badgeText}>{campus} Campus</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  badgeContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  badgeText: {
    color: "#d4d4d8",
    fontSize: 13,
    fontWeight: "500",
  },
});
