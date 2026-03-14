import React, { useEffect } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { GlassBackground } from "./GlassBackground";
import { GLASS } from "./glassTheme";

export interface SegmentOption<T extends string = string> {
  key: T;
  label: string;
  /** Optional badge count shown next to the label */
  badge?: number;
}

export interface GlassSegmentedControlProps<T extends string = string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (key: T) => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * A glass segmented control (tab switcher) with a smooth Reanimated sliding pill.
 *
 * Usage:
 * ```tsx
 * <GlassSegmentedControl
 *   options={[{ key: "friends", label: "My Crew" }, { key: "requests", label: "Requests", badge: 3 }]}
 *   value={activeTab}
 *   onChange={setActiveTab}
 * />
 * ```
 */
export function GlassSegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  style,
}: Readonly<GlassSegmentedControlProps<T>>) {
  const segmentCount = options.length;
  const activeIndex = options.findIndex((o) => o.key === value);
  const pillX = useSharedValue(0);

  useEffect(() => {
    // Spring-animate the pill to the active segment
    pillX.value = withSpring(activeIndex, {
      damping: 22,
      stiffness: 180,
      mass: 0.5,
    });
  }, [activeIndex, pillX]);

  const pillStyle = useAnimatedStyle(() => ({
    left: `${(pillX.value / segmentCount) * 100}%`,
    width: `${(1 / segmentCount) * 100}%`,
  }));

  return (
    <View style={[styles.container, style]}>
      {/* Track glass background */}
      <GlassBackground
        style={StyleSheet.absoluteFill}
        glassStyle="regular"
        blurIntensity={GLASS.blurLight}
        blurTint={GLASS.tintDark}
        fallbackColor="rgba(14, 14, 16, 0.9)"
      />

      {/* Sliding pill */}
      <Animated.View style={[styles.pill, pillStyle]}>
        <View style={styles.pillInner} />
      </Animated.View>

      {/* Segment buttons */}
      <View style={styles.segmentsRow}>
        {options.map((option) => {
          const isActive = option.key === value;
          return (
            <TouchableOpacity
              key={option.key}
              style={styles.segment}
              onPress={() => onChange(option.key)}
              activeOpacity={0.7}
            >
              <View style={styles.segmentContent}>
                <Text
                  style={[styles.label, isActive && styles.labelActive]}
                >
                  {option.label}
                </Text>
                {option.badge !== undefined && option.badge > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{option.badge}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 44,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: GLASS.borderColor,
    position: "relative",
  },
  pill: {
    position: "absolute",
    top: 4,
    bottom: 4,
    borderRadius: 11,
    padding: 4,
  },
  pillInner: {
    flex: 1,
    borderRadius: 9,
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  segmentsRow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  segmentContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: GLASS.textMuted,
  },
  labelActive: {
    color: GLASS.textPrimary,
  },
  badge: {
    backgroundColor: GLASS.accent,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
});
