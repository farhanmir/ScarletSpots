export interface ForecastPoint {
  time: string;
  expected_occupancy: number;
  low?: number;
  high?: number;
  label?: string;
}

export interface ForecastResponse {
  slices?: Record<string, ForecastPoint>;
  curve?: ForecastPoint[];
}
