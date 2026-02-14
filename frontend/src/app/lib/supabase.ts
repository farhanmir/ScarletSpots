import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

const supabaseUrl = `https://${projectId}.supabase.co`;

export const supabase = createClient(supabaseUrl, publicAnonKey);

export const API_BASE = `${supabaseUrl}/functions/v1/make-server-8814ba2a`;

/**
 * Safely parse JSON from a response, returning an error object if it fails.
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

export async function apiCall(endpoint: string, options: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || publicAnonKey;

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'apikey': publicAnonKey,
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const data = await safeJson(response);

  if (!response.ok) {
    console.error(`API error on ${endpoint} (${response.status}):`, data);
    throw new Error(data.error || `API request failed (${response.status})`);
  }

  return data;
}
