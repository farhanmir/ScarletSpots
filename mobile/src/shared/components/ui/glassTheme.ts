/**
 * Shared design tokens for the glass / translucent UI system.
 *
 * Two palettes are provided — dark (the original design) and light.
 * Use `useGlassTheme()` to get the palette that matches the current color
 * scheme; prefer that over the static `GLASS` export in new code.
 */

import type { BlurTint } from "expo-blur";
import { useResolvedColorScheme } from "@/shared/hooks/use-resolved-color-scheme";

// ── Dark palette ───────────────────────────────────────────────────────────────

export const GLASS_DARK = {
  /** Blur intensity for heavy overlays (modals, sticky headers) */
  blurHeavy: 80,
  /** Blur intensity for mid-weight surfaces (cards, sections) */
  blurMedium: 22,
  /** Blur intensity for light touches (search bar, pills) */
  blurLight: 14,

  /** Primary blur tint for this palette */
  blurTint: "systemChromeMaterialDark" as BlurTint,
  /** @deprecated Kept for legacy callers — use blurTint */
  tintDark: "systemChromeMaterialDark" as BlurTint,

  /** Thin edge border that catches light on glass surfaces */
  borderColor: "rgba(255, 255, 255, 0.06)",
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
   * Neutral icon container background and icon tint for list-row icons.
   */
  iconBg: "rgba(255, 255, 255, 0.07)",
  iconColor: "#a1a1aa",
} as const;

// ── Light palette ──────────────────────────────────────────────────────────────

export const GLASS_LIGHT = {
  blurHeavy: 80,
  blurMedium: 22,
  blurLight: 14,

  blurTint: "systemChromeMaterialLight" as BlurTint,
  /** @deprecated Kept for legacy callers — use blurTint */
  tintDark: "systemChromeMaterialLight" as BlurTint,

  borderColor: "rgba(0, 0, 0, 0.08)",
  borderColorFocused: "rgba(204, 0, 51, 0.45)",

  fallbackDark: "rgba(245, 245, 247, 0.92)",
  fallbackCard: "rgba(252, 252, 254, 0.95)",

  accent: "#cc0033",
  accentSubtle: "rgba(204, 0, 51, 0.08)",
  accentBorder: "rgba(204, 0, 51, 0.18)",

  textPrimary: "#111111",
  textSecondary: "#3f3f46",
  textMuted: "#71717a",
  textDim: "#a1a1aa",

  radius: 16,
  radiusLarge: 20,
  radiusSmall: 10,

  iconBg: "rgba(0, 0, 0, 0.06)",
  iconColor: "#52525b",
} as const;

// ── Backward-compatible default export (always dark) ──────────────────────────

/** @deprecated Prefer `useGlassTheme()` for theme-aware components. */
export const GLASS = GLASS_DARK;

/** Either glass palette — use for `createStyles(theme)` / `createLotStyles(theme)` params. */
export type GlassThemePalette = typeof GLASS_DARK | typeof GLASS_LIGHT;

// ── Hook ──────────────────────────────────────────────────────────────────────

/** Returns the correct glass palette for the active color scheme. */
export function useGlassTheme() {
  const mode = useResolvedColorScheme();
  return mode === "light" ? GLASS_LIGHT : GLASS_DARK;
}
