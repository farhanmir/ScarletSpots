import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY environment variables.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// API Helper for calling Edge Functions and FastAPI backend
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const debuggerHost = Constants.expoConfig?.hostUri;
const localHostIp = debuggerHost?.split(':')[0] || 'localhost';

// If on physical device, use the LAN IP extracted from Expo. If on Android emulator and debuggerHost fails, fallback to 10.0.2.2.
const LOCAL_FASTAPI_URL = debuggerHost
  ? `http://${localHostIp}:8000/api/v1`
  : Platform.OS === 'android' ? 'http://10.0.2.2:8000/api/v1' : 'http://localhost:8000/api/v1';

const API_BASES = [
  `${supabaseUrl}/functions/v1/server`,
  `${supabaseUrl}/functions/v1/make-server-8814ba2a`,
];

// Routes that strictly live on the new Python FastAPI backend
const FASTAPI_ROUTES = ['/friends', '/lots/custom', '/park/session'];

async function fetchWithFunctionFallback(endpoint: string, init: RequestInit): Promise<Response> {
  // 1. Intercept FastAPI exclusive routes
  if (FASTAPI_ROUTES.some(route => endpoint.startsWith(route))) {
    console.log(`[api] Routing to local FastAPI backend: ${endpoint}`);
    return await fetch(`${LOCAL_FASTAPI_URL}${endpoint}`, init);
  }

  let lastResponse: Response | null = null;

  // 2. Fallback cycle for Edge Functions
  for (const base of API_BASES) {
    const response = await fetch(`${base}${endpoint}`, init);
    lastResponse = response;

    if (response.status !== 404) {
      if (base !== API_BASES[0]) {
        console.log(`[api] Using fallback function route: ${base}`);
      }
      return response;
    }
  }

  return lastResponse as Response;
}

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
  const response = await fetchWithFunctionFallback(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      ...(options.headers || {}),
    } as HeadersInit,
  });

  const data = await safeJson(response);

  if (!response.ok) {
    console.error(`Public API error on ${endpoint} (${response.status}):`, data);
    throw new Error(data.error || `API request failed (${response.status})`);
  }

  return data;
}

import NetInfo from '@react-native-community/netinfo';

const OFFLINE_QUEUE_KEY = 'offline_action_queue';

export async function getOfflineQueue(): Promise<{ endpoint: string, options: RequestInit }[]> {
  try {
    const queue = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    return queue ? JSON.parse(queue) : [];
  } catch (e) {
    return [];
  }
}

async function addToOfflineQueue(endpoint: string, options: RequestInit) {
  // Only queue POST/PUT/DELETE requests (mutations)
  if (!options.method || options.method === 'GET') return;

  try {
    const queue = await getOfflineQueue();
    queue.push({ endpoint, options });
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    console.log(`[Offline] Action queued for ${endpoint}`);
  } catch (e) {
    console.error('[Offline] Failed to queue action:', e);
  }
}

export async function syncOfflineQueue() {
  const queue = await getOfflineQueue();
  if (queue.length === 0) return;

  const state = await NetInfo.fetch();
  if (!state.isConnected) return;

  console.log(`[Offline] Syncing ${queue.length} actions...`);
  await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY); // Clear immediately to prevent duplicate syncs

  for (const action of queue) {
    try {
      // Replay the exact auth request
      await authApiCall(action.endpoint, action.options);
      console.log(`[Offline] Synced: ${action.endpoint}`);
    } catch (e) {
      console.error(`[Offline] Failed to sync ${action.endpoint}:`, e);
      // Could push back to queue here if it's a 500/timeout, but for now we'll drop it if it fails again
    }
  }
}

/**
 * Authenticated API call - requires a valid user session.
 * Use for endpoints like /park/session/active that need the user's JWT.
 * Returns null silently if no session exists (instead of crashing).
 */
export async function authApiCall(endpoint: string, options: RequestInit = {}): Promise<any> {
  // Check network BEFORE attempting
  const netState = await NetInfo.fetch();
  if (!netState.isConnected) {
    console.log(`[authApiCall] device offline, queueing ${endpoint}`);
    await addToOfflineQueue(endpoint, options);
    // Return a mock success response so the UI doesn't crash
    if (endpoint.includes('/park/session') && options.method === 'POST') {
      return { success: true, session: { id: 'offline-pending', active: true, startTime: new Date().toISOString() } };
    }
    return { success: true, _offline: true };
  }

  // 1. Get current session
  let { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    console.log(`No session for authenticated call to ${endpoint}, skipping.`);
    return null;
  }

  // 2. Check if token is expired (JWT exp claim)
  try {
    const payload = JSON.parse(atob(session.access_token.split('.')[1]));
    const now = Math.floor(Date.now() / 1000);
    // Refresh if expired or about to expire in 60s
    if (payload.exp && payload.exp < now + 60) {
      console.log(`[authApiCall] Token expiring/expired for ${endpoint}, refreshing...`);
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshData.session) {
        console.log(`[authApiCall] Refresh failed: ${refreshError?.message}, signing out.`);
        await supabase.auth.signOut();
        return null;
      }
      session = refreshData.session;
    }
  } catch {
    // Ignore JWT parse errors
  }

  // 3. Make the request
  let response;
  try {
    response = await fetchWithFunctionFallback(endpoint, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey as string,
        'Authorization': `Bearer ${session?.access_token || supabaseAnonKey}`,
        'x-user-token': session?.access_token || '',
        ...(options.headers || {}),
      } as HeadersInit,
    });
  } catch (error) {
    // Fetch threw an error (likely network failure midway)
    console.log(`[authApiCall] Network fetch failed, queueing ${endpoint}`);
    await addToOfflineQueue(endpoint, options);
    if (endpoint.includes('/park/session') && options.method === 'POST') {
      return { success: true, session: { id: 'offline-pending', active: true, startTime: new Date().toISOString() } };
    }
    return { success: true, _offline: true };
  }

  // 4. Handle 401 (Unauthorized) - Try one more refresh if we haven't already
  if (response.status === 401) {
    const errorBody = await response.clone().text();
    console.log(`[authApiCall] Got 401 on ${endpoint} with error: ${errorBody}`);
    console.log(`[authApiCall] Trying force refresh...`);
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

    if (!refreshError && refreshData.session) {
      // Retry with new token
      try {
        response = await fetchWithFunctionFallback(endpoint, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseAnonKey as string,
            'Authorization': `Bearer ${refreshData.session.access_token}`,
            'x-user-token': refreshData.session.access_token,
            ...(options.headers || {}),
          } as HeadersInit,
        });
      } catch (err) {
        console.log(`[authApiCall] Network fetch failed on retry, queueing ${endpoint}`);
        await addToOfflineQueue(endpoint, options);
        return { success: true, _offline: true };
      }
    } else {
      console.log(`[authApiCall] Force refresh failed, signing out.`);
      await supabase.auth.signOut();
      return null;
    }
  }

  // 5. If response is STILL 401 (retry failed), definitively sign out
  if (response.status === 401) {
    console.log(`[authApiCall] Retry still 401 on ${endpoint}, signing out.`);
    await supabase.auth.signOut();
    return null;
  }

  const data = await safeJson(response);

  if (!response.ok) {
    console.error(`Auth API error on ${endpoint} (${response.status}):`, data);
    throw new Error(data.error || `API request failed (${response.status})`);
  }

  return data;
}

// Keep backward-compatible apiCall that routes to the right one
export async function apiCall(endpoint: string, options: RequestInit = {}): Promise<any> {
  return publicApiCall(endpoint, options);
}
