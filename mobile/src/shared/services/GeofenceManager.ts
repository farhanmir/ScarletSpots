type GeofenceLot = {
  id?: string;
  name?: string;
};

let geofenceBootstrapped = false;

export async function bootstrapLotGeofenceRegistration(
  lots: GeofenceLot[],
): Promise<void> {
  // CI was failing because this module was missing; keep bootstrap safe/no-op
  // until geofence runtime wiring is implemented again.
  if (geofenceBootstrapped) return;
  geofenceBootstrapped = true;
  console.info(
    `[GeofenceManager] Bootstrap deferred (${lots.length} lots provided).`,
  );
}

export function teardownLotGeofenceRegistration(): void {
  geofenceBootstrapped = false;
}
