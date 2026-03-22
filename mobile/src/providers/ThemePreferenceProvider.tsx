import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "theme_preference";

interface ThemePreferenceContextType {
  readonly preference: ThemePreference;
  readonly setPreference: (p: ThemePreference) => void;
}

const ThemePreferenceContext = createContext<ThemePreferenceContextType>({
  preference: "system",
  setPreference: () => {},
});

export function ThemePreferenceProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  // Restore saved preference on mount and apply it before first paint.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw === "light" || raw === "dark" || raw === "system") {
        setPreferenceState(raw);
        // RN accepts `null` to follow the OS scheme; typings are incomplete.
        Appearance.setColorScheme((raw === "system" ? null : raw) as never);
      }
    });
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    Appearance.setColorScheme((p === "system" ? null : p) as never);
    AsyncStorage.setItem(STORAGE_KEY, p).catch(() => {
      // Storage write failure is non-critical; preference stays correct in memory.
    });
  }, []);

  const value = useMemo(
    () => ({ preference, setPreference }),
    [preference, setPreference]
  );

  return (
    <ThemePreferenceContext.Provider value={value}>
      {children}
    </ThemePreferenceContext.Provider>
  );
}

export const useThemePreference = () => useContext(ThemePreferenceContext);
