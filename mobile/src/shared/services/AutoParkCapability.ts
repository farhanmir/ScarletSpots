import { Platform } from "react-native";
import * as Location from "expo-location";
import { Pedometer } from "expo-sensors";

export function hasPreciseLocation(
  fg: Location.LocationPermissionResponse,
): boolean {
  if (Platform.OS === "ios") {
    return fg.ios?.accuracy === "full";
  }
  if (Platform.OS === "android") {
    return fg.android?.accuracy === "fine";
  }
  return true;
}

export async function needsOnboardingRedirect(): Promise<boolean> {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    // Only block the app (redirect to onboarding) if they don't even have foreground location.
    // We degrade gracefully if background or precise location is missing.
    return fg.status !== "granted";
  } catch {
    return false;
  }
}

export type AutoParkBlockedReason =
  | "location_foreground"
  | "location_background"
  | "location_imprecise"
  | "motion";

export interface AutoParkCapabilityStatus {
  /** True when background location + precision + motion are all OK for best-effort auto-park. */
  ok: boolean;
  /** Subset of issues — location background missing is the hardest blocker for geofences. */
  reasons: AutoParkBlockedReason[];
  /** Always + precise — required for geofence wake and background location task. */
  backgroundLocationOk: boolean;
  /** Motion & Fitness — improves pedometer / fusion; app still works without it (degraded). */
  motionOk: boolean;
}

/**
 * Snapshot of permissions affecting auto-park. Call on launch and when AppState → active.
 */
export async function getAutoParkCapability(): Promise<AutoParkCapabilityStatus> {
  const fg = await Location.getForegroundPermissionsAsync();
  const bg = await Location.getBackgroundPermissionsAsync();
  const precise = hasPreciseLocation(fg);
  const motion = await Pedometer.getPermissionsAsync();

  const reasons: AutoParkBlockedReason[] = [];
  if (fg.status !== "granted") reasons.push("location_foreground");
  if (bg.status !== "granted") reasons.push("location_background");
  if (!precise) reasons.push("location_imprecise");
  if (motion.status !== "granted") reasons.push("motion");

  const backgroundLocationOk =
    fg.status === "granted" && bg.status === "granted" && precise;
  const motionOk = motion.status === "granted";

  return {
    ok: backgroundLocationOk && motionOk,
    reasons,
    backgroundLocationOk,
    motionOk,
  };
}
