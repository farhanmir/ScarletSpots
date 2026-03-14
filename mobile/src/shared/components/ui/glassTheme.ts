/**
 * Shared design tokens for the glass / translucent UI system.
 *
 * Use these constants throughout Glass* components and screens so the
 * visual language stays consistent across Search, Friends, and Profile.
 */

import type { BlurTint } from "expo-blur";

export const GLASS = {
  /** Blur intensity for heavy overlays (modals, sticky headers) */
  blurHeavy: 80,
  /** Blur intensity for mid-weight surfaces (cards, sections) */
  blurMedium: 22,
  /** Blur intensity for light touches (search bar, pills) */
  blurLight: 14,

  /** BlurTint for dark backgrounds */
  tintDark: "systemChromeMaterialDark" as BlurTint,

  /** Thin edge border that catches light on glass surfaces */
  borderColor: "rgba(255, 255, 255, 0.04)",
  /** Slightly brighter border for interactive / focused elements */
  borderColorFocused: "rgba(220, 38, 38, 0.55)",

  /** Solid fallback color used on Android and non-blur surfaces */
  fallbackDark: "rgba(12, 12, 14, 0.88)",
  /** Lighter fallback for inset cards inside an already-dark surface */
  fallbackCard: "rgba(18, 18, 20, 0.82)",

  /** Scarlet accent (Rutgers red) */
  accent: "#dc2626",
  accentSubtle: "rgba(220, 38, 38, 0.10)",
  accentBorder: "rgba(220, 38, 38, 0.22)",

  /** Text colours */
  textPrimary: "#fafafa",
  textSecondary: "#a1a1aa",
  textMuted: "#52525b",
  textDim: "#3f3f46",

  /** Standard corner radius for cards and containers */
  radius: 16,
  radiusLarge: 20,
  radiusSmall: 10,

  /**
   * Neutral icon container background — use this for list-row icons that are
   * informational (car, building, map pin). Reserve accentSubtle for primary
   * CTAs and brand-identity spots only.
   */
  iconBg: "rgba(255, 255, 255, 0.07)",
  /** Neutral tint for list-row icons (pairs with iconBg) */
  iconColor: "#a1a1aa",
} as const;
