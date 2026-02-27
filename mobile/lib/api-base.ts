import Constants from 'expo-constants';
import { Platform } from 'react-native';

const debuggerHost = Constants.expoConfig?.hostUri;
const localHostIp = debuggerHost?.split(':')[0] || 'localhost';

// If on physical device, use the LAN IP extracted from Expo. 
// If on Android emulator and debuggerHost fails, fallback to 10.0.2.2.
export const LOCAL_FASTAPI_URL = debuggerHost
  ? `http://${localHostIp}:8000/api/v1`
  : Platform.OS === 'android' ? 'http://10.0.2.2:8000/api/v1' : 'http://localhost:8000/api/v1';

export async function fetchBackend(endpoint: string, init: RequestInit): Promise<Response> {
  const url = `${LOCAL_FASTAPI_URL}${endpoint}`;
  console.log(`[api] Fetching ${url}`);
  try {
    const response = await fetch(url, init);
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
    console.error('Non-JSON response:', text.substring(0, 200));
    return { error: text || `HTTP ${response.status}` };
  }
}
