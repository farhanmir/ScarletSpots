import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack, useSegments, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, Text, TouchableOpacity } from "react-native";
import "react-native-reanimated";
import { useEffect, useRef } from "react";
import { QueryClient } from "@tanstack/react-query";
import "@/shared/services/BackgroundTasks"; // Register background tasks globally

import { useColorScheme } from "@/shared/hooks/use-color-scheme";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { IconSymbol } from "@/shared/components/ui/icon-symbol";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";

import OfflineBanner from "@/shared/components/ui/OfflineBanner";
import {
  initOfflineQueue,
  teardownOfflineQueue,
} from "@/shared/services/OfflineQueue";
import { installGlobalCrashHandlers } from "@/shared/services/CrashLogger";
import { TabBarProvider } from "@/providers/TabBarProvider";
import { registerLotGeofences } from "@/shared/services/GeofenceManager";
import { getAllLots } from "@/shared/constants/lots";
import { ENABLE_ALL_CAMPUSES } from "@/shared/constants/featureFlags";

// Global Error Boundary
export { ErrorBoundary } from "expo-router";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // Keep data in memory / AsyncStorage for 24 h
      staleTime: 1000 * 60 * 5, // Data is "fresh" for 5 min — no refetch needed
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
});

export const unstable_settings = {
  anchor: "(tabs)",
};

function InitialLayout() {
  const { isAuthenticated, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const hasBootstrappedGeofences = useRef(false);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "auth";

    if (!isAuthenticated && !inAuthGroup) {
      // Redirect to choice if not signed in and not trying to login
      router.replace("/auth/choice" as any);
    } else if (isAuthenticated && inAuthGroup) {
      // Route through root so permission gating can run.
      router.replace("/" as any);
    }
  }, [isAuthenticated, loading, segments, router]);

  useEffect(() => {
    if (loading || !isAuthenticated || hasBootstrappedGeofences.current) return;
    hasBootstrappedGeofences.current = true;

    registerLotGeofences(getAllLots(ENABLE_ALL_CAMPUSES)).catch((err) =>
      console.warn("[RootLayout] Geofence bootstrap failed:", err),
    );
  }, [loading, isAuthenticated]);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <TabBarProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="auth/login" />
          <Stack.Screen name="onboarding/permissions" />
          <Stack.Screen
            name="lot/[id]"
            options={{
              presentation: "formSheet",
              headerShown: false,
              sheetAllowedDetents: [0.35, 0.95],
              sheetGrabberVisible: true,
              sheetCornerRadius: 30,
              sheetLargestUndimmedDetentIndex: 1,
              sheetExpandsWhenScrolledToEdge: true,
              contentStyle: { backgroundColor: "#000000" },
            }}
          />
          <Stack.Screen
            name="modal"
            options={{
              presentation: "modal",
              title: "Modal",
              headerShown: true,
            }}
          />
        </Stack>
      </TabBarProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  // Install crash handlers once at boot
  useEffect(() => {
    installGlobalCrashHandlers();
  }, []);

  useEffect(() => {
    initOfflineQueue();
    return () => teardownOfflineQueue();
  }, []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: asyncStoragePersister }}
    >
      <AuthProvider>
        <OfflineBanner />
        <InitialLayout />
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
