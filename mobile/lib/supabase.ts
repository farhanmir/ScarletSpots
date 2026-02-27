import { supabase, supabaseAnonKey } from './supabase-client';
export { supabase, supabaseAnonKey };

// API Helpers derived from base
import { fetchBackend, safeJson } from './api-base';

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
import { queueParkAction } from '../services/OfflineQueue';

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
    
    // Use the unified OfflineQueue
    const payload = options.body ? JSON.parse(options.body as string) : {};
    if (endpoint.includes('/park/session') && options.method === 'POST') {
      await queueParkAction(endpoint.includes('end') ? 'END_PARK' : 'PARK', payload);
      return { success: true, session: { id: 'offline-pending', active: true, startTime: new Date().toISOString() } };
    } else if (options.method && options.method !== 'GET') {
      // @ts-ignore - endpoint is added to QueuedParkAction in service
      await queueParkAction('GENERIC_MUTATION', payload, endpoint, options.method);
    }
    
    return { success: true, _offline: true };
  }

  // 1. Get current session
  let { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    console.log(`No session for authenticated call to ${endpoint}, skipping.`);
    return null;
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
    // Fetch threw an error (likely network failure midway).
    // For park mutations, queue the semantic action type and return the same
    // consistent session payload that the explicit offline path returns — so
    // handlePark always receives a usable session object regardless of which
    // offline path was taken.
    console.log(`[authApiCall] Network fetch failed, queueing ${endpoint}`);
    const payload = options.body ? JSON.parse(options.body as string) : {};
    if (endpoint.includes('/park/session') && options.method === 'POST') {
      const isEnd = endpoint.includes('end');
      await queueParkAction(isEnd ? 'END_PARK' : 'PARK', payload);
      if (!isEnd) {
        return {
          success: true,
          _offline: true,
          session: {
            id: `offline-${Date.now()}`,
            lotId: payload.lotId as string,
            spotNumber: payload.spotNumber as string,
            startTime: new Date().toISOString(),
            active: true,
          },
        };
      }
    } else if (options.method && options.method !== 'GET') {
      // @ts-ignore
      await queueParkAction('GENERIC_MUTATION', payload, endpoint, options.method);
    }
    return { success: true, _offline: true };
  }

  // 4. Handle 401 ...
  if (response.status === 401) {
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshData.session) {
      try {
        response = await fetchBackend(endpoint, {
          ...options,
          headers: {
            ...options.headers,
            'Authorization': `Bearer ${refreshData.session.access_token}`,
            'x-user-token': refreshData.session.access_token,
          } as any,
        });
      } catch (err) {
        return { success: true, _offline: true };
      }
    } else {
      await supabase.auth.signOut();
      return null;
    }
  }

  if (response.status === 401) {
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
