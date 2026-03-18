import { getAccessTokenSilently } from "@/providers/AuthProvider";
import { fetchBackend, safeJson } from "./api-base";
import NetInfo from "@react-native-community/netinfo";
import { queueParkAction } from "@/shared/services/OfflineQueue";

/**
 * Public API call.
 */
export async function publicApiCall(
  endpoint: string,
  options: RequestInit = {},
): Promise<any> {
  const response = await fetchBackend(endpoint, {
    ...options,
    headers: {
      "Content-Type": "application/json",
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
 * Authenticated API call using Logto tokens.
 */
export async function authApiCall(
  endpoint: string,
  options: RequestInit = {},
): Promise<any> {
  // Check network BEFORE attempting
  const netState = await NetInfo.fetch();
  if (!netState.isConnected) {
    console.log(`[authApiCall] device offline, queueing ${endpoint}`);

    const payload = options.body ? JSON.parse(options.body as string) : {};
    if (endpoint.includes("/park/session") && options.method === "POST") {
      await queueParkAction(
        endpoint.includes("end") ? "END_PARK" : "PARK",
        payload,
      );
      return {
        success: true,
        session: {
          id: "offline-pending",
          active: true,
          startTime: new Date().toISOString(),
        },
      };
    } else if (options.method && options.method !== "GET") {
      // @ts-ignore
      await queueParkAction(
        "GENERIC_MUTATION",
        payload,
        endpoint,
        options.method,
      );
    }

    return { success: true, _offline: true };
  }

  // 1. Get current token from global getter
  const accessToken = await getAccessTokenSilently();

  if (!accessToken) {
    console.log(`No token for authenticated call to ${endpoint}, skipping.`);
    return null;
  }

  // 3. Make the request
  let response;
  try {
    response = await fetchBackend(endpoint, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(options.headers || {}),
      } as HeadersInit,
    });
  } catch {
    console.log(`[authApiCall] Network fetch failed, queueing ${endpoint}`);
    const payload = options.body ? JSON.parse(options.body as string) : {};
    if (endpoint.includes("/park/session") && options.method === "POST") {
      const isEnd = endpoint.includes("end");
      await queueParkAction(isEnd ? "END_PARK" : "PARK", payload);
      if (!isEnd) {
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
      }
    } else if (options.method && options.method !== "GET") {
      // @ts-ignore
      await queueParkAction(
        "GENERIC_MUTATION",
        payload,
        endpoint,
        options.method,
      );
    }
    return { success: true, _offline: true };
  }

  // Note: Logto SDK handles token refreshing internally via getAccessTokenSilently.
  // If we get a 401 here, it truly means the token is invalid or the session is gone.
  if (response.status === 401) {
    console.log("401 Unauthorized from backend, token might be invalid.");
    return null;
  }

  const data = await safeJson(response);
  if (!response.ok) {
    console.error(`Auth API error on ${endpoint} (${response.status}):`, data);
    throw new Error(data.error || `API request failed (${response.status})`);
  }

  return data;
}

// Keep backward-compatible apiCall
export async function apiCall(
  endpoint: string,
  options: RequestInit = {},
): Promise<any> {
  return publicApiCall(endpoint, options);
}
