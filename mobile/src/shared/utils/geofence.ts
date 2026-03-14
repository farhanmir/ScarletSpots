/**
 * Ray-Casting Algorithm to determine if a point is inside a polygon.
 * @param point Array [latitude, longitude]
 * @param polygon Array of Array [[lat, lng], [lat, lng], ...]
 * @returns boolean true if inside, false otherwise
 */
export function isPointInPolygon(
  point: number[],
  polygon: number[][],
): boolean {
  const x = point[0]; // latitude
  const y = point[1]; // longitude

  let isInside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) {
      isInside = !isInside;
    }
  }

  return isInside;
}
