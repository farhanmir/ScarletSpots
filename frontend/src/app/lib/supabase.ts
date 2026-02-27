import { createClient } from '@supabase/supabase-js';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const publicAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !publicAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables.');
}

export const supabase = createClient(supabaseUrl, publicAnonKey);

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const getErrorMessage = (payload: unknown, fallback: string) => {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const errorValue = (payload as { error?: unknown }).error;
    if (typeof errorValue === 'string' && errorValue.length > 0) {
      return errorValue;
    }
  }

  return fallback;
};

/**
 * Safely parse JSON from a response, returning an error object if it fails.
 */
async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    console.error('Non-JSON response:', text.substring(0, 200));
    return { error: text || `HTTP ${response.status}` };
  }
}

/**
 * Get a valid auth token, refreshing the session if needed.
 * Falls back to the anon key if no valid session exists.
 */
async function getToken(): Promise<string> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      // Check if token is expired (JWT exp claim)
      try {
        const payload = JSON.parse(atob(session.access_token.split('.')[1]));
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
          // Token expired — try refresh
          console.log('[apiCall] Token expired, refreshing...');
          const { data: refreshData } = await supabase.auth.refreshSession();
          if (refreshData.session?.access_token) {
            return refreshData.session.access_token;
          }
          // Refresh failed — sign out and use anon key
          console.log('[apiCall] Refresh failed, using anon key');
          await supabase.auth.signOut();
          return publicAnonKey;
        }
      } catch {
        // Can't parse JWT — use it as-is
      }
      return session.access_token;
    }
  } catch (err) {
    console.error('[apiCall] getSession error:', err);
  }
  return publicAnonKey;
}

export async function apiCall(endpoint: string, options: RequestInit = {}) {
  const token = await getToken();

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  // If 401 and we used a user token, retry with anon key
  if (response.status === 401 && token !== publicAnonKey) {
    console.log('[apiCall] Got 401, retrying with anon key...');
    await supabase.auth.signOut();
    const retryResponse = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${publicAnonKey}`,
        ...options.headers,
      },
    });
    const retryData = await safeJson(retryResponse);
    if (!retryResponse.ok) {
      console.error(`API error on ${endpoint} (${retryResponse.status}):`, retryData);
      throw new Error(getErrorMessage(retryData, `API request failed (${retryResponse.status})`));
    }
    return retryData;
  }

  const data = await safeJson(response);

  if (!response.ok) {
    console.error(`API error on ${endpoint} (${response.status}):`, data);
    throw new Error(getErrorMessage(data, `API request failed (${response.status})`));
  }

  return data;
}
