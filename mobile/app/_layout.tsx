import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack, useSegments, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, Text, TouchableOpacity } from "react-native";
import "react-native-reanimated";
import { useEffect } from "react";
import { QueryClient } from "@tanstack/react-query";
import "@/shared/services/BackgroundTasks"; // Register background tasks globally
import "@/shared/services/GeofenceManager";

import { useColorScheme } from "@/shared/hooks/use-color-scheme";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { isSupabaseConfigValid } from "@/shared/api/supabase-client";
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

// Global Error Boundary
export { ErrorBoundary } from "expo-router";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // ── Aggressive caching to prevent 951-request blizzards ──────────────────
      // Hot-reloading, re-mounts, and app-foreground events all re-use
      // cached data rather than hitting the network.
      gcTime: 1000 * 60 * 60 * 24, // Keep data in memory / AsyncStorage for 24 h
      staleTime: 1000 * 60 * 5, // Data is "fresh" for 5 min — no refetch needed
      refetchOnMount: false, // Never auto-refetch just because a component mounts
      refetchOnWindowFocus: false, // Never refetch when the RN app comes to foreground
      refetchOnReconnect: true, // DO refetch when coming back online (offline-first)
      retry: 1, // One retry on failure, then give up
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
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = useColorScheme();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "auth";

    if (!session && !inAuthGroup) {
      // Redirect to choice if not signed in and not trying to login
      router.replace("/auth/choice" as any);
    } else if (session && inAuthGroup) {
      // Redirect to app if signed in and trying to access login
      router.replace("/(tabs)" as any);
    }
  }, [session, loading, segments, router]);

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
              getId: () => "lot-sheet",
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
            options={{ presentation: "modal", title: "Modal", headerShown: true }}
          />
        </Stack>
      </TabBarProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

function ConfigErrorScreen() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#000000",
        justifyContent: "center",
        alignItems: "center",
        padding: 40,
      }}
    >
      <IconSymbol
        name="exclamationmark.triangle.fill"
        size={64}
        color="#dc2626"
      />
      <Text
        style={{
          color: "#fff",
          fontSize: 24,
          fontWeight: "bold",
          marginTop: 24,
          textAlign: "center",
        }}
      >
        Configuration Missing
      </Text>
      <Text
        style={{
          color: "#a1a1aa",
          fontSize: 16,
          marginTop: 12,
          textAlign: "center",
          lineHeight: 24,
        }}
      >
        The app is missing required Supabase environment variables. Please check
        your .env file and restart the Expo server.
      </Text>
      <TouchableOpacity
        style={{
          marginTop: 40,
          backgroundColor: "#27272a",
          paddingHorizontal: 24,
          paddingVertical: 12,
          borderRadius: 12,
        }}
        onPress={() => {
          /* Could add a reload functionality here if desired */
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "bold" }}>
          See Documentation
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export default function RootLayout() {
  // Install crash handlers once at boot
  useEffect(() => {
    installGlobalCrashHandlers();
  }, []);

  useEffect(() => {
    // initOfflineQueue registers its own NetInfo listener and flushes the
    // queue whenever the device comes back online. Calling it here (once, at
    // root mount) is the single authoritative reconnect handler — no duplicate
    // NetInfo.addEventListener wrappers needed.
    initOfflineQueue();
    return () => teardownOfflineQueue();
  }, []);

  if (!isSupabaseConfigValid) {
    return <ConfigErrorScreen />;
  }

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
