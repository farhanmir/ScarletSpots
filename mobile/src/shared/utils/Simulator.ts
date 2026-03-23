import * as Location from "expo-location";
import { runParkingDetectionFromLocation } from "@/shared/services/BackgroundTasks";
import { RutgersLot } from "@/shared/constants/lots";
import { BackgroundLogger } from "@/shared/utils/Logger";

function createMockLocation(
  latitude: number,
  longitude: number,
  speed: number,
  heading: number,
  timestamp: number,
): Location.LocationObject {
  return {
    coords: {
      latitude,
      longitude,
      altitude: 0,
      accuracy: 5,
      altitudeAccuracy: 5,
      heading,
      speed,
    },
    timestamp,
  };
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function simulateAutoParkDriveInAndWalkOut(lot: RutgersLot) {
  BackgroundLogger.info(`[Simulator] Starting Auto-Park simulation for ${lot.name}`);
  const now = Date.now();

  try {
    // 1. Driving outside the lot (> 5 m/s)
    BackgroundLogger.info("[Simulator] Step 1: Driving towards lot (speed=6.0m/s)");
    let loc = createMockLocation(lot.latitude + 0.001, lot.longitude + 0.001, 6.0, 180, now - 15000);
    await runParkingDetectionFromLocation(loc);
    await delay(500);

    // 2. Entering the lot polygon (speed drops slightly)
    BackgroundLogger.info("[Simulator] Step 2: Entered lot polygon (speed=5.5m/s)");
    loc = createMockLocation(lot.latitude, lot.longitude, 5.5, 180, now - 10000);
    await runParkingDetectionFromLocation(loc);
    await delay(500);

    // 3. Parked and walking away (speed drops to walking 1.5 m/s)
    BackgroundLogger.info("[Simulator] Step 3: Parked, getting out (speed=1.5m/s)");
    loc = createMockLocation(lot.latitude, lot.longitude, 1.5, 0, now - 5000);
    await runParkingDetectionFromLocation(loc);
    await delay(500);

    // 4. Continued walking away (speed 1.4 m/s) -> triggers Auto-Confirm
    BackgroundLogger.info("[Simulator] Step 4: Walking away (speed=1.4m/s)");
    loc = createMockLocation(lot.latitude, lot.longitude, 1.4, 0, now);
    await runParkingDetectionFromLocation(loc);

    BackgroundLogger.info("[Simulator] Simulation sequence dispatched successfully.");
  } catch (error: any) {
    BackgroundLogger.error("[Simulator] Simulation failed: " + error.message);
  }
}
