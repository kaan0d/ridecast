// Weather along the route: where to sample, which forecast hour applies, how to name it.

export interface WeatherHour {
  timeMs: number; // start of the forecast hour, epoch ms (UTC)
  tempC: number;
  feelsC: number;
  precipMm: number;
  precipProb: number | null; // %; missing for past hours
  snowCm: number;
  code: number; // WMO weather code
  windKmh: number;
  gustKmh: number;
  windFromDeg: number; // meteorological: direction the wind comes from
  visibilityM: number;
  isDay: boolean;
}

export type WeatherSeries = WeatherHour[]; // sorted by time

// Distances (m) from start to end inclusive, evenly spaced so that there is roughly one point per
// `intervalMin` of the route's own driving time, capped at `maxPoints`.
export function sampleDistances(totalM: number, durationS: number, intervalMin: number, maxPoints: number): number[] {
  if (!(totalM > 0)) return [0];
  const gaps = Math.min(maxPoints - 1, Math.max(1, Math.round(durationS / 60 / intervalMin)));
  return Array.from({ length: gaps + 1 }, (_, i) => (totalM * i) / gaps);
}

// The forecast hour closest to `ms`, or null when the nearest one is more than `maxGapMin` away.
export function nearestHour(series: WeatherSeries, ms: number, maxGapMin: number): WeatherHour | null {
  let best: WeatherHour | null = null;
  for (const h of series) if (!best || Math.abs(h.timeMs - ms) < Math.abs(best.timeMs - ms)) best = h;
  return best && Math.abs(best.timeMs - ms) <= maxGapMin * 60_000 ? best : null;
}

export type Condition = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

// WMO weather interpretation codes (Open-Meteo docs).
export function conditionOf(code: number): { kind: Condition; label: string } {
  if (code === 0) return { kind: "clear", label: "Açık" };
  if (code === 1) return { kind: "partly", label: "Az bulutlu" };
  if (code === 2) return { kind: "partly", label: "Parçalı bulutlu" };
  if (code === 3) return { kind: "cloudy", label: "Kapalı" };
  if (code === 45 || code === 48) return { kind: "fog", label: "Sis" };
  if (code >= 51 && code <= 57) return { kind: "drizzle", label: code >= 56 ? "Donan çisenti" : "Çisenti" };
  if (code === 66 || code === 67) return { kind: "rain", label: "Donan yağmur" };
  if ((code >= 61 && code <= 65) || (code >= 80 && code <= 82)) {
    const heavy = code === 65 || code === 82;
    const light = code === 61 || code === 80;
    return { kind: "rain", label: heavy ? "Şiddetli yağmur" : light ? "Hafif yağmur" : "Yağmur" };
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { kind: "snow", label: "Kar" };
  if (code >= 95) return { kind: "storm", label: code === 95 ? "Gök gürültülü fırtına" : "Dolulu fırtına" };
  return { kind: "cloudy", label: "Bilinmiyor" };
}

const COMPASS = ["K", "KD", "D", "GD", "G", "GB", "B", "KB"];

// Eight-point Turkish compass name for a direction in degrees.
export const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
