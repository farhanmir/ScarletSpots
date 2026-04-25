import { runAutoParkSmokeTest } from "../../../modules/parking-magic";
import { RutgersLot } from "@/shared/constants/lots";
import { BackgroundLogger } from "@/shared/utils/Logger";

export async function simulateAutoParkDriveInAndWalkOut(lot: RutgersLot) {
  BackgroundLogger.info(`[Simulator] Running native Auto-Park smoke test for ${lot.name}`);

  try {
    const result = await runAutoParkSmokeTest(lot.latitude, lot.longitude);
    BackgroundLogger.info("[Simulator] Native smoke test result", result);
  } catch (error: any) {
    BackgroundLogger.error("[Simulator] Simulation failed: " + error.message);
  }
}
