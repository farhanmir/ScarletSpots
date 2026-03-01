/**
 * GlassCard — primary reusable Lunar Glass container.
 *
 * Renders a BlurView frost panel on iOS, with a dark semi-transparent
 * fallback on Android.  All cards/sheets/buttons in the app should derive
 * from this component so the glass aesthetic stays consistent.
 *
 * Usage:
 *   <GlassCard style={{ padding: 16 }}>
 *     <Text>content</Text>
 *   </GlassCard>
 */

import React from 'react';
import {
  View,
  StyleSheet,
  Platform,
  type ViewStyle,
  type StyleProp,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Theme } from '@/constants/theme';

export interface GlassCardProps {
  children?: React.ReactNode;
  /** Additional styles applied to the outer container */
  style?: StyleProp<ViewStyle>;
  /** BlurView frost intensity (iOS only). Defaults to Theme.blurIntensity */
  blurIntensity?: number;
  /** Corner radius. Defaults to Theme.radiusLG */
  borderRadius?: number;
  /** Suppress the default 0.5 px glass border */
  noBorder?: boolean;
  /** Suppress the default drop shadow */
  noShadow?: boolean;
}

export default function GlassCard({
  children,
  style,
  blurIntensity = Theme.blurIntensity,
  borderRadius = Theme.radiusLG,
  noBorder = false,
  noShadow = false,
}: GlassCardProps) {
  return (
    <View
      style={[
        styles.card,
        { borderRadius },
        !noBorder && styles.border,
        !noShadow && Theme.shadowMD,
        style,
      ]}
    >
      {/* Frost layer */}
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={blurIntensity}
          tint="systemChromeMaterialDark"
          style={[StyleSheet.absoluteFill, { borderRadius }]}
        />
      ) : (
        <View
          style={[StyleSheet.absoluteFill, styles.androidFallback, { borderRadius }]}
        />
      )}

      {/* Content */}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  border: {
    borderWidth: 0.5,
    borderColor: Theme.borderDefault,
  },
  androidFallback: {
    backgroundColor: Theme.glassAndroid,
  },
});
