export const PARKING_CONFIDENCE_THRESHOLD = (() => {
  const envVal = process.env.EXPO_PUBLIC_PARKING_CONFIDENCE_THRESHOLD;
  const parsed = parseFloat(envVal || '0.8');
  if (isNaN(parsed)) return 0.8;
  return Math.min(Math.max(parsed, 0.5), 1.0);
})();
