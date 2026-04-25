import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";

import { supabase } from "@/shared/api/supabase-client";

const debuggerHost = Constants.expoConfig?.hostUri;
const localHostIp = debuggerHost?.split(":")[0] || "localhost";
const ENV_API_URL = process.env.EXPO_PUBLIC_API_URL;
const LOCAL_FASTAPI_URL =
  ENV_API_URL ||
  (debuggerHost
    ? `http://${localHostIp}:8000/api/v1`
    : Platform.OS === "android"
      ? "http://10.0.2.2:8000/api/v1"
      : "http://localhost:8000/api/v1");

type CachedAttestation = {
  token: string;
  expiresAtMs: number;
};

let cached: CachedAttestation | null = null;

function getDeviceIdSeed(): string {
  const installId =
    Constants.installationId ||
    Constants.expoConfig?.slug ||
    Constants.expoConfig?.name ||
    "scarletspots";
  return `${Platform.OS}:${installId}`;
}

async function getDeviceId(): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    getDeviceIdSeed(),
  );
  return digest.slice(0, 40);
}

function isCachedValid(): boolean {
  return !!cached && Date.now() < cached.expiresAtMs - 30_000;
}

async function fetchAttestationSession(): Promise<CachedAttestation | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;

  const payload = {
    platform: Platform.OS,
    device_id: await getDeviceId(),
    provider: "self_reported",
  };

  const response = await fetch(`${LOCAL_FASTAPI_URL}/system/attestation/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return null;

  const data = await response.json();
  if (!data?.token) return null;
  return {
    token: data.token,
    expiresAtMs: Date.now() + Number(data.expires_in_seconds || 600) * 1000,
  };
}

export async function getAttestationHeaders(): Promise<Record<string, string>> {
  try {
    if (!isCachedValid()) {
      cached = await fetchAttestationSession();
    }
    if (!cached?.token) return {};
    return {
      "x-attestation-token": cached.token,
      "x-attestation-platform": Platform.OS,
    };
  } catch {
    return {};
  }
}

export async function getWebSocketAttestationPayload(): Promise<
  Record<string, string>
> {
  const headers = await getAttestationHeaders();
  const token = headers["x-attestation-token"];
  if (!token) return {};
  return {
    attestation_token: token,
    attestation_platform: Platform.OS,
  };
}
