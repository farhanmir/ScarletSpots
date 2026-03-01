/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

// ─── Lunar Glass Design System ────────────────────────────────────────────────
//
// Usage:  import { Theme } from '@/constants/theme';

export const Theme = {
  // ── Base ──────────────────────────────────────────────────────────────────
  /** Deep System Gray — primary dark background */
  base: '#1C1C1E',
  baseElevated: '#2C2C2E',
  baseDeep: '#09090B',

  // ── Brand ─────────────────────────────────────────────────────────────────
  /** Muted Scarlet — primary accent for icons, buttons, status indicators */
  scarlet: '#CC0033',
  scarletDim: '#99002A',
  scarletTint: 'rgba(204, 0, 51, 0.15)',
  scarletBorder: 'rgba(204, 0, 51, 0.35)',

  // ── Surface / Glass ───────────────────────────────────────────────────────
  glass: 'rgba(28, 28, 30, 0.60)',
  glassElevated: 'rgba(44, 44, 46, 0.80)',
  glassAndroid: 'rgba(20, 20, 22, 0.94)',

  // ── Text ──────────────────────────────────────────────────────────────────
  textPrimary: '#F2F2F7',
  textSecondary: '#AEAEB2',
  textTertiary: '#636366',

  // ── Borders ───────────────────────────────────────────────────────────────
  /** Subtle 0.5 px glass border — #FFFFFF15 */
  borderSubtle: 'rgba(255, 255, 255, 0.08)',
  borderDefault: 'rgba(255, 255, 255, 0.12)',
  borderStrong: 'rgba(255, 255, 255, 0.20)',

  // ── Blur ──────────────────────────────────────────────────────────────────
  blurIntensity: 85,
  blurIntensityHeavy: 95,

  // ── Geometry (Apple Squircle) ─────────────────────────────────────────────
  radiusXS: 8,
  radiusSM: 12,
  radiusMD: 16,
  radiusLG: 22,
  radiusXL: 28,
  radiusPill: 999,

  // ── Spacing ───────────────────────────────────────────────────────────────
  spacingXS: 6,
  spacingSM: 10,
  spacingMD: 16,
  spacingLG: 24,

  // ── Shadows ───────────────────────────────────────────────────────────────
  shadowSM: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  shadowMD: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30,
    shadowRadius: 12,
    elevation: 8,
  },
  shadowLG: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.40,
    shadowRadius: 20,
    elevation: 14,
  },

  // ── Typography ────────────────────────────────────────────────────────────
  fontFamily: Platform.select({
    ios: 'system',
    android: 'sans-serif',
    default: 'system-ui',
  }),
} as const;

