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

async function fetchBackend(endpoint: string, init: RequestInit): Promise<Response> {
  // Exclusively target the Python FastAPI backend
  const url = `${LOCAL_FASTAPI_URL}${endpoint}`;
  console.log(`[api] Fetching ${url}`);
  return await fetch(url, init);
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
  const response = await fetchBackend(endpoint, {
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

    // Deduplication: skip if an identical endpoint+method is already queued
    const isDuplicate = queue.some(
      (q) => q.endpoint === endpoint && q.options?.method === options.method
    );
    if (isDuplicate) {
      console.log(`[Offline] Skipping duplicate queue entry for ${options.method} ${endpoint}`);
      return;
    }

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
  await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);

  const failedActions: { endpoint: string; options: RequestInit; _retryCount?: number }[] = [];

  for (const action of queue) {
    try {
      await authApiCall(action.endpoint, action.options);
      console.log(`[Offline] Synced: ${action.endpoint}`);
    } catch (e) {
      const retryCount = (action as any)._retryCount || 0;
      if (retryCount < 3) {
        // Re-queue with incremented retry count
        failedActions.push({ ...action, _retryCount: retryCount + 1 } as any);
        console.warn(`[Offline] Retry ${retryCount + 1}/3 queued for ${action.endpoint}`);
      } else {
        console.error(`[Offline] Dropped after 3 retries: ${action.endpoint}`);
      }
    }
  }

  // Re-save any failed actions for next sync
  if (failedActions.length > 0) {
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(failedActions));
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
    response = await fetchBackend(endpoint, {
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
        response = await fetchBackend(endpoint, {
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
