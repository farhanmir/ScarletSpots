import { useColorScheme } from "react-native";
import { useThemePreference } from "@/providers/ThemePreferenceProvider";

/**
 * Single source of truth for light vs dark UI. Prefer this over raw
 * `useColorScheme()` so manual Appearance overrides (theme preference) stay
 * consistent with system mode and avoid mismatches on iOS form sheets / modals.
 */
export function useResolvedColorScheme(): "light" | "dark" {
  const systemScheme = useColorScheme();
  const { preference } = useThemePreference();

  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return systemScheme === "light" ? "light" : "dark";
}
