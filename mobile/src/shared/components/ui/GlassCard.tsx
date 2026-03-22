import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  type AnimatedProps,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";
import { GlassBackground } from "./GlassBackground";
import { useGlassTheme } from "./glassTheme";

export interface GlassCardProps {
  children: React.ReactNode;
  /** Outer container style (applied to the animated wrapper) */
  style?: StyleProp<ViewStyle>;
  /** Inner content padding container style */
  contentStyle?: StyleProp<ViewStyle>;
  /** Border radius override */
  borderRadius?: number;
  /** expo-glass-effect glassStyle (iOS 26+ only) */
  glassStyle?: "regular" | "clear";
  /** Blur intensity for the frosted-glass background */
  blurIntensity?: number;
  /** Whether to animate the card in/out when mounted/unmounted */
  animated?: boolean;
  /** Reanimated entering preset override */
  entering?: AnimatedProps<object>["entering"];
  /** Reanimated exiting preset override */
  exiting?: AnimatedProps<object>["exiting"];
  /** Extra border color override — defaults to current theme's borderColor */
  borderColor?: string;
}

/**
 * A reusable glass card surface.
 *
 * On iOS it uses expo-glass-effect (iOS 26+) or expo-blur (older), and on
 * Android it falls back to a translucent solid background.
 *
 * Usage:
 * ```tsx
 * <GlassCard style={{ marginBottom: 10 }}>
 *   <Text>Content here</Text>
 * </GlassCard>
 * ```
 */
export function GlassCard({
  children,
  style,
  contentStyle,
  borderRadius,
  glassStyle = "regular",
  blurIntensity,
  animated = false,
  entering = FadeIn.duration(200),
  exiting = FadeOut.duration(150),
  borderColor,
}: Readonly<GlassCardProps>) {
  const theme = useGlassTheme();
  const resolvedBorderRadius = borderRadius ?? theme.radius;
  const resolvedBlurIntensity = blurIntensity ?? theme.blurMedium;
  const resolvedBorderColor = borderColor ?? theme.borderColor;

  const containerStyle = [
    styles.card,
    { borderRadius: resolvedBorderRadius, borderColor: resolvedBorderColor },
    style,
  ];

  const inner = (
    <>
      <GlassBackground
        style={StyleSheet.absoluteFill}
        glassStyle={glassStyle}
        blurIntensity={resolvedBlurIntensity}
      />
      <View style={[styles.content, contentStyle]}>{children}</View>
    </>
  );

  if (animated) {
    return (
      <Animated.View
        style={containerStyle}
        entering={entering}
        exiting={exiting}
      >
        {inner}
      </Animated.View>
    );
  }

  return <View style={containerStyle}>{inner}</View>;
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  content: {
    padding: 16,
  },
});
