import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
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
  /** @deprecated variant is no longer used; kept for API compatibility */
  variant?: "glass" | "flat";
}

const AnimatedPressable = Animated.createAnimatedComponent(View);

/**
 * Tab switcher built with:
 *  - BlurView (expo-blur) for the frosted glass track
 *  - Individual Reanimated pill buttons with scale + opacity spring
 *  - Haptic feedback via expo-haptics on selection
 *
 * Active tab → scarlet pill, white label.
 * Inactive   → transparent, muted label.
 * Badges     → small scarlet bubble (count > 0 only).
 */
export function GlassSegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  style,
}: Readonly<GlassSegmentedControlProps<T>>) {
  return (
    <BlurView
      intensity={22}
      tint="systemChromeMaterialDark"
      style={[styles.track, style]}
    >
      {/* Inset border rendered as an absolute View so it clips correctly */}
      <View style={styles.trackBorder} pointerEvents="none" />

      {options.map((option) => (
        <PillButton
          key={option.key}
          option={option}
          isActive={option.key === value}
          onPress={() => {
            if (option.key !== value) {
              Haptics.selectionAsync();
              onChange(option.key);
            }
          }}
        />
      ))}
    </BlurView>
  );
}

// ── PillButton ────────────────────────────────────────────────────────────────

function PillButton<T extends string>({
  option,
  isActive,
  onPress,
}: Readonly<{
  option: SegmentOption<T>;
  isActive: boolean;
  onPress: () => void;
}>) {
  const scale = useSharedValue(1);
  const labelOpacity = useSharedValue(isActive ? 1 : 0.45);

  React.useEffect(() => {
    labelOpacity.value = withTiming(isActive ? 1 : 0.45, { duration: 180 });
  }, [isActive, labelOpacity]);

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onBegin(() => {
      scale.value = withSpring(0.93, { damping: 18, stiffness: 300 });
    })
    .onFinalize(() => {
      scale.value = withSpring(1, { damping: 18, stiffness: 300 });
      onPress();
    });

  const pillAnim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const labelAnim = useAnimatedStyle(() => ({
    opacity: labelOpacity.value,
  }));

  return (
    <GestureDetector gesture={tap}>
      <AnimatedPressable style={[styles.pill, pillAnim]}>
        {isActive && <View style={styles.activePill} />}
        <Animated.View style={[styles.pillContent, labelAnim]}>
          <Text
            style={[styles.label, isActive && styles.labelActive]}
            numberOfLines={1}
          >
            {option.label}
          </Text>
          {option.badge !== undefined && option.badge > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{option.badge}</Text>
            </View>
          )}
        </Animated.View>
      </AnimatedPressable>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    height: 46,
    borderRadius: 23,
    overflow: "hidden",
    alignItems: "center",
    paddingHorizontal: 4,
    gap: 2,
  },
  trackBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  pill: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  activePill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 18,
    backgroundColor: "rgba(204, 0, 51, 0.20)",
    borderWidth: 1,
    borderColor: "rgba(204, 0, 51, 0.40)",
  },
  pillContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: GLASS.textMuted,
    letterSpacing: 0.1,
  },
  labelActive: {
    color: "#ffffff",
  },
  badge: {
    backgroundColor: "#cc0033",
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
    fontWeight: "800",
  },
});
