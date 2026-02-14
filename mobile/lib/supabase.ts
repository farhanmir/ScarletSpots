import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => {
    return SecureStore.deleteItemAsync(key);
  },
};

const supabaseUrl = 'https://dfkxffdplikdyhuvubnr.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma3hmZmRwbGlrZHlodXZ1Ym5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMjI5NTksImV4cCI6MjA4NjU5ODk1OX0.cTJoF4JC2j7qw8QGt2JNcXupIQEDvdwbCUOfm-fGOAI';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// API Helper for calling Edge Functions
const API_BASE = `${supabaseUrl}/functions/v1/make-server-8814ba2a`;

/**
 * Safely parse JSON from a response, returning null if it fails.
 */
async function safeJson(response: Response): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    console.error('Non-JSON response:', text.substring(0, 200));
    return { error: text || `HTTP ${response.status}` };
  }
}

/**
 * Public API call - uses the anon key, no user session required.
 * Use for endpoints like /lots, /signup that don't need auth.
 */
export async function publicApiCall(endpoint: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      ...options.headers,
    },
  });

  const data = await safeJson(response);

  if (!response.ok) {
    console.error(`Public API error on ${endpoint} (${response.status}):`, data);
    throw new Error(data.error || `API request failed (${response.status})`);
  }

  return data;
}

/**
 * Authenticated API call - requires a valid user session.
 * Use for endpoints like /park/session/active that need the user's JWT.
 * Returns null silently if no session exists (instead of crashing).
 */
export async function authApiCall(endpoint: string, options: RequestInit = {}): Promise<any> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    console.log(`No session for authenticated call to ${endpoint}, skipping.`);
    return null;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    },
  });

  const data = await safeJson(response);

  if (!response.ok) {
    if (response.status === 401) {
      console.log(`Session expired for ${endpoint}, signing out.`);
      await supabase.auth.signOut();
      return null;
    }
    console.error(`Auth API error on ${endpoint} (${response.status}):`, data);
    throw new Error(data.error || `API request failed (${response.status})`);
  }

  return data;
}

// Keep backward-compatible apiCall that routes to the right one
export async function apiCall(endpoint: string, options: RequestInit = {}): Promise<any> {
  return publicApiCall(endpoint, options);
}
