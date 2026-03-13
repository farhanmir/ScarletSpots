import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// We don't throw here anymore to prevent module-level crashes.
// Instead, we export a helper to check if config is valid.
export const isSupabaseConfigValid = !!supabaseUrl && !!supabaseAnonKey;

const isServer = typeof window === 'undefined';

// Avoid storage access during server-side rendering.
const noOpStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

const authStorage = isServer
  ? noOpStorage
  : Platform.OS === 'web'
    ? undefined
    : AsyncStorage;

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder', {
  auth: {
    storage: authStorage,
    autoRefreshToken: !isServer,
    persistSession: !isServer,
    detectSessionInUrl: false,
  },
});
