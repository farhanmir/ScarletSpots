export const getOccupancyColor = (rate: number) => {
  if (rate >= 90) return "#ef4444"; // Red
  if (rate >= 70) return "#f59e0b"; // Amber
  return "#10b981"; // Emerald
};

/** Returns a color that scales with occupancy (0–100). Multiple shades from green → amber → red. */
export const getOccupancyGradientColor = (rate: number): string => {
  const r = Math.max(0, Math.min(100, rate));
  if (r <= 25) {
    // Light green → green
    const t = r / 25;
    return interpolateColor("#86efac", "#22c55e", t);
  }
  if (r <= 50) {
    // Green → yellow-amber
    const t = (r - 25) / 25;
    return interpolateColor("#22c55e", "#eab308", t);
  }
  if (r <= 75) {
    // Yellow-amber → orange
    const t = (r - 50) / 25;
    return interpolateColor("#eab308", "#f97316", t);
  }
  // Orange → red
  const t = (r - 75) / 25;
  return interpolateColor("#f97316", "#ef4444", t);
};

function interpolateColor(hexA: string, hexB: string, t: number): string {
  const parse = (h: string) => {
    const n = Number.parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
  };
  const [r1, g1, b1] = parse(hexA);
  const [r2, g2, b2] = parse(hexB);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export const formatTime = (isoString: string) => {
  const date = new Date(isoString);
  let hours = date.getHours();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}${ampm}`;
};
