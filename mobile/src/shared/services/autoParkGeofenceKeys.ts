import AsyncStorage from "@react-native-async-storage/async-storage";

/** Set when user enters a lot geofence; cleared on exit. */
export const GEOFENCE_ACTIVE_TRACKING_START_KEY =
  "ss_geofence_active_tracking_start_ts";

export const SENSOR_TRACKING_BUDGET_MS = 10 * 60 * 1000;

export async function getSensorBudgetRemainingMs(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(GEOFENCE_ACTIVE_TRACKING_START_KEY);
    if (!raw) return SENSOR_TRACKING_BUDGET_MS;
    const start = Number(raw);
    if (!Number.isFinite(start)) return SENSOR_TRACKING_BUDGET_MS;
    return Math.max(0, SENSOR_TRACKING_BUDGET_MS - (Date.now() - start));
  } catch {
    return SENSOR_TRACKING_BUDGET_MS;
  }
}
