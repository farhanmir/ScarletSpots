import Constants from "expo-constants";
import { Platform } from "react-native";
import { getAttestationHeaders } from "@/shared/security/attestation";

const debuggerHost = Constants.expoConfig?.hostUri;
const localHostIp = debuggerHost?.split(":")[0] || "localhost";

// If on physical device, use the LAN IP extracted from Expo.
// If on Android emulator and debuggerHost fails, fallback to 10.0.2.2.
// Alternatively, use EXPO_PUBLIC_API_URL if defined in the env
const ENV_API_URL = process.env.EXPO_PUBLIC_API_URL;

export const LOCAL_FASTAPI_URL =
  ENV_API_URL ||
  (debuggerHost
    ? `http://${localHostIp}:8000/api/v1`
    : Platform.OS === "android"
      ? "http://10.0.2.2:8000/api/v1"
      : "http://localhost:8000/api/v1");

export const WEBSOCKET_BASE_URL = (() => {
  try {
    const apiUrl = new URL(LOCAL_FASTAPI_URL);
    const wsProtocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${apiUrl.host}`;
  } catch {
    return "ws://localhost:8000";
  }
})();

export async function fetchBackend(
  endpoint: string,
  init: RequestInit,
): Promise<Response> {
  const url = `${LOCAL_FASTAPI_URL}${endpoint}`;
  const parsed = new URL(url);
  const isLocalhost =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname.startsWith("10.");
  if (!isLocalhost && parsed.protocol !== "https:") {
    throw new Error("Blocked insecure backend request");
  }
  console.log(`[api] Fetching ${url}`);
  try {
    const attestationHeaders = await getAttestationHeaders();
    const mergedHeaders: HeadersInit = {
      ...(init.headers || {}),
      ...attestationHeaders,
    };
    const response = await fetch(url, {
      ...init,
      headers: mergedHeaders,
    });
    console.log(`[api] Response ${response.status} from ${url}`);
    return response;
  } catch (err: any) {
    console.warn(`[api] Fetch failed for ${url}: ${err.message}`);
    throw err;
  }
}

/**
 * Safely parse JSON from a response, returning null if it fails.
 */
export async function safeJson(response: Response): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    console.error("Non-JSON response:", text.substring(0, 200));
    return { error: text || `HTTP ${response.status}` };
  }
}
