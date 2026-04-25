import { supabase, supabaseAnonKey } from "./supabase-client";

// API Helpers derived from base
import { fetchBackend, safeJson } from "./api-base";

import NetInfo from "@react-native-community/netinfo";
import {
  generateIdempotencyKey,
  queueParkAction,
} from "@/shared/services/OfflineQueue";
export { supabase, supabaseAnonKey };

function resolveIdempotencyKey(
  endpoint: string,
  options: RequestInit,
): string | undefined {
  const headers = options.headers;
  let existing: string | undefined;

  if (headers instanceof Headers) {
    existing = headers.get("Idempotency-Key") ?? undefined;
  } else if (Array.isArray(headers)) {
    const hit = headers.find(
      ([k]) => k.toLowerCase() === "idempotency-key",
    );
    existing = hit?.[1];
  } else if (headers && typeof headers === "object") {
    const map = headers as Record<string, string>;
    existing = map["Idempotency-Key"] ?? map["idempotency-key"];
  }
  if (existing) return existing;
  if (options.method === "POST" && endpoint.startsWith("/park/session")) {
    return generateIdempotencyKey(endpoint.replaceAll("/", "_"));
  }
  return undefined;
}

/**
 * Public API call - uses the anon key, no user session required.
 * Use for endpoints like /lots, /signup that don't need auth.
 */
export async function publicApiCall(
  endpoint: string,
  options: RequestInit = {},
): Promise<any> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetchBackend(endpoint, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session?.access_token || supabaseAnonKey}`,
      ...(options.headers || {}),
    } as HeadersInit,
  });

  const data = await safeJson(response);

  if (!response.ok) {
    console.error(
      `Public API error on ${endpoint} (${response.status}):`,
      data,
    );
    throw new Error(data.error || `API request failed (${response.status})`);
  }

  return data;
}

/**
 * Authenticated API call - requires a valid user session.
 * Use for endpoints like /park/session/active that need the user's JWT.
 * Returns null silently if no session exists (instead of crashing).
 */
export async function authApiCall(
  endpoint: string,
  options: RequestInit = {},
): Promise<any> {
  // Check network BEFORE attempting
  const netState = await NetInfo.fetch();
  if (!netState.isConnected) {
    console.log(`[authApiCall] device offline, queueing ${endpoint}`);

    // Use the unified OfflineQueue
    const payload = options.body ? JSON.parse(options.body as string) : {};
    const idempotencyKey = resolveIdempotencyKey(endpoint, options);
    if (endpoint === "/park/session" && options.method === "POST") {
      await queueParkAction(
        "PARK",
        payload,
        undefined,
        undefined,
        undefined,
        idempotencyKey,
      );
      return {
        success: true,
        session: {
          id: "offline-pending",
          active: true,
          startTime: new Date().toISOString(),
        },
      };
    } else if (endpoint === "/park/session/end" && options.method === "POST") {
      await queueParkAction(
        "END_PARK",
        payload,
        undefined,
        undefined,
        undefined,
        idempotencyKey,
      );
      return { success: true, _offline: true };
    } else if (endpoint === "/park/session/feedback" && options.method === "POST") {
      await queueParkAction(
        "GENERIC_MUTATION",
        payload,
        endpoint,
        options.method,
        undefined,
        idempotencyKey,
      );
      return { success: true, _offline: true };
    } else if (options.method && options.method !== "GET") {
      // @ts-ignore - endpoint is added to QueuedParkAction in service
      await queueParkAction(
        "GENERIC_MUTATION",
        payload,
        endpoint,
        options.method,
        undefined,
        idempotencyKey,
      );
    }

    return { success: true, _offline: true };
  }

  // 1. Get current session
  let {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    console.log(`No session for authenticated call to ${endpoint}, skipping.`);
    return null;
  }

  // 3. Make the request
  const idempotencyKey = resolveIdempotencyKey(endpoint, options);
  let response;
  try {
    response = await fetchBackend(endpoint, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseAnonKey as string,
        Authorization: `Bearer ${session?.access_token || supabaseAnonKey}`,
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        ...(options.headers || {}),
      } as HeadersInit,
    });
  } catch {
    // Fetch threw an error (likely network failure midway).
    // For park mutations, queue the semantic action type and return the same
    // consistent session payload that the explicit offline path returns — so
    // handlePark always receives a usable session object regardless of which
    // offline path was taken.
    console.log(`[authApiCall] Network fetch failed, queueing ${endpoint}`);
    const payload = options.body ? JSON.parse(options.body as string) : {};
    if (endpoint === "/park/session" && options.method === "POST") {
      await queueParkAction(
        "PARK",
        payload,
        undefined,
        undefined,
        undefined,
        idempotencyKey,
      );
      return {
        success: true,
        _offline: true,
        session: {
          id: `offline-${Date.now()}`,
          lotId: payload.lotId as string,
          startTime: new Date().toISOString(),
          active: true,
          latitude: payload.latitude,
          longitude: payload.longitude,
          autoStarted: !!payload.autoStarted,
        },
      };
    } else if (endpoint === "/park/session/end" && options.method === "POST") {
      await queueParkAction(
        "END_PARK",
        payload,
        undefined,
        undefined,
        undefined,
        idempotencyKey,
      );
      return { success: true, _offline: true };
    } else if (endpoint === "/park/session/feedback" && options.method === "POST") {
      await queueParkAction(
        "GENERIC_MUTATION",
        payload,
        endpoint,
        options.method,
        undefined,
        idempotencyKey,
      );
      return { success: true, _offline: true };
    } else if (options.method && options.method !== "GET") {
      // @ts-ignore
      await queueParkAction(
        "GENERIC_MUTATION",
        payload,
        endpoint,
        options.method,
        undefined,
        idempotencyKey,
      );
    }
    return { success: true, _offline: true };
  }

  // 4. Handle 401 ...
  if (response.status === 401) {
    const { data: refreshData, error: refreshError } =
      await supabase.auth.refreshSession();
    if (!refreshError && refreshData.session) {
      try {
        response = await fetchBackend(endpoint, {
          ...options,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${refreshData.session.access_token}`,
            ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
          } as any,
        });
      } catch {
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
export async function apiCall(
  endpoint: string,
  options: RequestInit = {},
): Promise<any> {
  return publicApiCall(endpoint, options);
}
