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

// API Helper for calling Edge Functions
const API_BASES = [
  `${supabaseUrl}/functions/v1/server`,
  `${supabaseUrl}/functions/v1/make-server-8814ba2a`,
];

async function fetchWithFunctionFallback(endpoint: string, init: RequestInit): Promise<Response> {
  let lastResponse: Response | null = null;

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

/**
 * Authenticated API call - requires a valid user session.
 * Use for endpoints like /park/session/active that need the user's JWT.
 * Returns null silently if no session exists (instead of crashing).
 */
export async function authApiCall(endpoint: string, options: RequestInit = {}): Promise<any> {
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
  let response = await fetchWithFunctionFallback(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey as string,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'x-user-token': session?.access_token || '',
      ...(options.headers || {}),
    } as HeadersInit,
  });

  // 4. Handle 401 (Unauthorized) - Try one more refresh if we haven't already
  if (response.status === 401) {
    const errorBody = await response.clone().text();
    console.log(`[authApiCall] Got 401 on ${endpoint} with error: ${errorBody}`);
    console.log(`[authApiCall] Trying force refresh...`);
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    
    if (!refreshError && refreshData.session) {
      // Retry with new token
      response = await fetchWithFunctionFallback(endpoint, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey as string,
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'x-user-token': refreshData.session.access_token,
          ...(options.headers || {}),
        } as HeadersInit,
      });
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
