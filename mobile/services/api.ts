import axios from 'axios';
import { supabase } from '../lib/supabase';

import { Platform } from 'react-native';

// Use localhost for iOS simulator, 10.0.2.2 for Android emulator
// For physical devices, you MUST use your computer's LAN IP (e.g. 192.168.1.x)
const getBaseUrl = () => {
    if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
    if (Platform.OS === 'android') return 'http://10.0.2.2:8001/api/v1';
    return 'http://localhost:8001/api/v1';
};

const BASE_URL = getBaseUrl();

// Create Axios Instance
export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Debug Logging
api.interceptors.request.use(request => {
  console.log('[API] Request:', request.method?.toUpperCase(), request.url);
  return request;
});

// Request Interceptor: Attach Auth Token
api.interceptors.request.use(
  async (config) => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        config.headers.Authorization = `Bearer ${data.session.access_token}`;
      }
    } catch (error) {
      console.error('Error fetching auth session:', error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor: Handle Global Errors (401, etc)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized (maybe redirect to login, though Supabase auth state usually handles this)
      console.log('API Unauthorized - Token might be expired');
    }
    return Promise.reject(error);
  }
);
