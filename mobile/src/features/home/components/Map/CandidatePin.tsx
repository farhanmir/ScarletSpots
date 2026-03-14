/**
 * CandidatePin — Map overlay for a detected-but-unconfirmed parking candidate.
 *
 * Renders:
 *   • A pulsing `Marker` at the candidate coordinate.
 *   • A translucent `Circle` whose radius reflects GPS accuracy + confidence
 *     uncertainty — visually communicating "we think you're somewhere in here".
 *
 * Confidence colour coding:
 *   ≥ 80 %  →  emerald  (high confidence)
 *   ≥ 60 %  →  amber    (medium — ask the user)
 *   < 60 %  →  rose     (low — just a hint)
 */

import React, { useEffect, useRef } from "react";
import { Animated, View, Text, StyleSheet } from "react-native";
import { Marker, Circle } from "react-native-maps";
import type { ParkingCandidate } from "@/shared/services/ParkingDetectionService";
import { confidenceToRadius } from "@/shared/services/ParkingDetectionService";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Props {
  readonly candidate: ParkingCandidate;
  /** GPS horizontal accuracy in metres (from the latest LocationObject). */
  readonly horizontalAccuracy?: number | null;
  /** Called when the user taps the pin bubble (shortcut to confirm). */
  readonly onPress?: () => void;
}

// ── Colour Helpers ─────────────────────────────────────────────────────────────

function getColors(confidence: number): {
  pin: string;
  circleFill: string;
  circleStroke: string;
  label: string;
} {
  if (confidence >= 0.8) {
    return {
      pin: "#10b981",
      circleFill: "rgba(16, 185, 129, 0.12)",
      circleStroke: "rgba(16, 185, 129, 0.5)",
      label: "High",
    };
  }
  if (confidence >= 0.6) {
    return {
      pin: "#f59e0b",
      circleFill: "rgba(245, 158, 11, 0.12)",
      circleStroke: "rgba(245, 158, 11, 0.5)",
      label: "Medium",
    };
  }
  return {
    pin: "#ef4444",
    circleFill: "rgba(239, 68, 68, 0.10)",
    circleStroke: "rgba(239, 68, 68, 0.45)",
    label: "Low",
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function CandidatePin({
  candidate,
  horizontalAccuracy,
  onPress,
}: Props) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Continuously pulse the outer ring to draw attention
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.35,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const colors = getColors(candidate.confidence);
  const radius = confidenceToRadius(
    candidate.confidence,
    horizontalAccuracy ?? null,
  );
  const pctLabel = `${Math.round(candidate.confidence * 100)}%`;

  return (
    <>
      {/* ── Uncertainty Circle ── */}
      <Circle
        center={{
          latitude: candidate.latitude,
          longitude: candidate.longitude,
        }}
        radius={radius}
        fillColor={colors.circleFill}
        strokeColor={colors.circleStroke}
        strokeWidth={1.5}
        zIndex={5}
      />

      {/* ── Candidate Marker ── */}
      <Marker
        coordinate={{
          latitude: candidate.latitude,
          longitude: candidate.longitude,
        }}
        anchor={{ x: 0.5, y: 1 }}
        zIndex={10}
        onPress={onPress}
        tracksViewChanges={false}
      >
        <View style={styles.markerRoot}>
          {/* Pulsing outer ring */}
          <Animated.View
            style={[
              styles.pulseRing,
              { borderColor: colors.pin, transform: [{ scale: pulseAnim }] },
            ]}
          />

          {/* Pin bubble */}
          <View style={[styles.bubble, { backgroundColor: colors.pin }]}>
            <Text style={styles.bubbleIcon}>🚗</Text>
            <Text style={styles.bubbleText}>{pctLabel}</Text>
          </View>

          {/* Lot name label */}
          <View style={styles.nameTag}>
            <Text style={styles.nameText} numberOfLines={1}>
              {candidate.lotName}
            </Text>
            <Text style={[styles.confidenceLabel, { color: colors.pin }]}>
              {colors.label} confidence
            </Text>
          </View>

          {/* Pin stem */}
          <View style={[styles.stem, { borderTopColor: colors.pin }]} />
        </View>
      </Marker>
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  markerRoot: {
    alignItems: "center",
  },
  pulseRing: {
    position: "absolute",
    top: -6,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    opacity: 0.6,
  },
  bubble: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 6,
  },
  bubbleIcon: {
    fontSize: 13,
  },
  bubbleText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  nameTag: {
    backgroundColor: "rgba(9, 9, 11, 0.85)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 4,
    alignItems: "center",
    maxWidth: 160,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.1)",
  },
  nameText: {
    color: "#f4f4f5",
    fontSize: 11,
    fontWeight: "600",
  },
  confidenceLabel: {
    fontSize: 10,
    fontWeight: "500",
    marginTop: 1,
  },
  stem: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -1,
  },
});
