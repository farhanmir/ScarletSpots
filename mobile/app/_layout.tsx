import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useSegments, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; // Import QueryClientProvider
import '../services/BackgroundTasks'; // Register background tasks globally
import '../services/GeofenceManager'; // Register geofence tasks globally

// Global Error Boundary
export { ErrorBoundary } from 'expo-router';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/context/AuthProvider';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      staleTime: 1000 * 30, // 30 seconds
    },
  },
});

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
});

export const unstable_settings = {
  anchor: '(tabs)',
};

function InitialLayout() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = useColorScheme();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === 'auth';

    if (!session && !inAuthGroup) {
      // Redirect to choice if not signed in and not trying to login
      router.replace('/auth/choice');
    } else if (session && inAuthGroup) {
      // Redirect to app if signed in and trying to access login
      router.replace('/(tabs)');
    }
  }, [session, loading, segments]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth/login" />
        <Stack.Screen name="onboarding/permissions" />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal', headerShown: true }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

import { SettingsProvider } from '@/context/SettingsContext';
import OfflineBanner from '@/components/ui/OfflineBanner';
import NetInfo from '@react-native-community/netinfo';
import { syncOfflineQueue } from '@/lib/supabase';
import { installGlobalCrashHandlers } from '@/services/CrashLogger';

export default function RootLayout() {
  // Install crash handlers once at boot
  useEffect(() => {
    installGlobalCrashHandlers();
  }, []);

  useEffect(() => {
    // Listen for global connection changes to trigger sync
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        syncOfflineQueue();
      }
    });
    return () => unsubscribe();
  }, []);

  return (
    <SettingsProvider>
      <PersistQueryClientProvider 
        client={queryClient}
        persistOptions={{ persister: asyncStoragePersister }}
      >
        <AuthProvider>
          <OfflineBanner />
          <InitialLayout />
        </AuthProvider>
      </PersistQueryClientProvider>
    </SettingsProvider>
  );
}
