import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { authApiCall } from "@/shared/api/supabase";

let registeredToken: string | null = null;

function getProjectId(): string | undefined {
  const expoConfigProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof expoConfigProjectId === "string" && expoConfigProjectId.length > 0) {
    return expoConfigProjectId;
  }

  const easProjectId = (Constants as any)?.easConfig?.projectId;
  if (typeof easProjectId === "string" && easProjectId.length > 0) {
    return easProjectId;
  }

  return undefined;
}

async function getExpoPushToken(): Promise<string | null> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return null;

  const projectId = getProjectId();
  const tokenResponse = projectId
    ? await Notifications.getExpoPushTokenAsync({ projectId })
    : await Notifications.getExpoPushTokenAsync();
  return tokenResponse?.data ?? null;
}

export async function syncPushTokenToBackend(): Promise<void> {
  try {
    const token = await getExpoPushToken();
    if (!token) return;
    if (registeredToken === token) return;

    await authApiCall("/users/me/push-token", {
      method: "POST",
      body: JSON.stringify({ token, platform: Platform.OS }),
    });

    registeredToken = token;
  } catch (err) {
    console.warn("[PushRegistration] Failed to sync push token:", err);
  }
}

export async function clearPushTokenFromBackend(): Promise<void> {
  if (!registeredToken) return;
  try {
    await authApiCall("/users/me/push-token", {
      method: "DELETE",
      body: JSON.stringify({ token: registeredToken }),
    });
  } catch (err) {
    console.warn("[PushRegistration] Failed to clear push token:", err);
  } finally {
    registeredToken = null;
  }
}
