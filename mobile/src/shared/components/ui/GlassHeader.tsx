import React from "react";
import {
  StyleSheet,
  Text,
  View,
  Platform,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { GlassBackground } from "./GlassBackground";
import { useGlassTheme } from "./glassTheme";

export interface GlassHeaderProps {
  title: string;
  subtitle?: string;
  /** Rendered on the right side of the header (e.g. icon button) */
  right?: React.ReactNode;
  /** Extra style for the outer container */
  style?: StyleProp<ViewStyle>;
  /** Whether to show a bottom border/separator */
  showBorder?: boolean;
  /** Custom paddingTop override (defaults to safe-area aware value) */
  paddingTop?: number;
}

/**
 * A sticky glass-style page header with title, optional subtitle, and a
 * right-side slot for action buttons.
 *
 * Render this AFTER the scrollable content in the component tree so that
 * expo-blur can read the content below it correctly.
 *
 * Usage:
 * ```tsx
 * <View style={{ flex: 1 }}>
 *   <FlatList ... />
 *   <GlassHeader title="Search" subtitle="Lots, buildings & places" />
 * </View>
 * ```
 */
export function GlassHeader({
  title,
  subtitle,
  right,
  style,
  showBorder = true,
  paddingTop,
}: Readonly<GlassHeaderProps>) {
  const theme = useGlassTheme();
  const topPad = paddingTop ?? (Platform.OS === "ios" ? 60 : 44);

  return (
    <View
      style={[
        styles.container,
        { paddingTop: topPad },
        showBorder && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.borderColor,
        },
        style,
      ]}
      pointerEvents="box-none"
    >
      {/* Glass background — sits behind all content in the header */}
      <GlassBackground
        style={StyleSheet.absoluteFill}
        glassStyle="regular"
        blurIntensity={theme.blurHeavy}
      />

      <View style={styles.row}>
        <View style={styles.titleGroup}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 16,
    zIndex: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  titleGroup: { flex: 1 },
  title: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  right: {
    marginLeft: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
