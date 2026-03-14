import React from 'react';
import { Platform, StyleProp, View, ViewStyle } from 'react-native';
import { BlurView, BlurTint } from 'expo-blur';
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';

export interface GlassBackgroundProps {
  style?: StyleProp<ViewStyle>;
  /**
   * Glass style to use when Liquid Glass is available on iOS 26+.
   * Falls back to BlurView / solid color elsewhere.
   */
  glassStyle?: 'regular' | 'clear';
  /**
   * Background color for Android and other non-glass fallbacks.
   */
  fallbackColor?: string;
  /**
   * Blur intensity / tint for iOS fallback when Liquid Glass is not available.
   */
  blurIntensity?: number;
  blurTint?: BlurTint;
}

export function GlassBackground({
  style,
  glassStyle = 'regular',
  fallbackColor = 'rgba(10,10,12,0.35)',
  blurIntensity = 80,
  blurTint = 'systemChromeMaterialDark',
}: Readonly<GlassBackgroundProps>) {
  if (Platform.OS === 'ios') {
    // Prefer true Liquid Glass on iOS 26+ when the API is available.
    if (isGlassEffectAPIAvailable() && isLiquidGlassAvailable()) {
      return (
        <GlassView
          style={style}
          colorScheme="dark"
          glassEffectStyle={glassStyle}
        />
      );
    }

    // Fallback to traditional frosted blur on older iOS or when Liquid Glass
    // is disabled by system / accessibility settings.
    return (
      <BlurView
        intensity={blurIntensity}
        tint={blurTint}
        style={style}
      />
    );
  }

  // Android / other platforms: solid, slightly translucent surface that matches
  // our existing design language.
  return <View style={[{ backgroundColor: fallbackColor }, style]} />;
}

