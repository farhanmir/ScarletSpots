/**
 * 🧹 Phase 6: Legacy activitySignal polling removed.
 * All hardware-layer signals are now handled by the native ParkingMagic module.
 */

export const loadActivityBoost = () => 0;
export const markWalkingActivityNow = () => {};
export const activitySignals = {
  loadAutoParkBoost: () => 0,
};
