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

export interface Forecast {
  hours: WeatherSeries;
  sun: { riseMs: number; setMs: number }[]; // one entry per forecast day
}

// Distances (m) from start to end inclusive, evenly spaced so that there is roughly one point per
// `intervalMin` of the route's own driving time, capped at `maxPoints`.
export function sampleDistances(totalM: number, durationS: number, intervalMin: number, maxPoints: number): number[] {
  if (!(totalM > 0)) return [0];
  const gaps = Math.min(maxPoints - 1, Math.max(1, Math.round(durationS / 60 / intervalMin)));
  return Array.from({ length: gaps + 1 }, (_, i) => (totalM * i) / gaps);
}

// Indexes of the forecast hours on either side of `ms` (one when `ms` is on the hour), nearest
// first, each within `maxGapMin`; empty when there is none. An ETA between two hours can fall in
// either one, so the caller takes the worse: a few minutes of ETA drift must not flip a warning.
// The series is in time order.
export function bracketHours(series: WeatherSeries, ms: number, maxGapMin: number): number[] {
  const after = series.findIndex((h) => h.timeMs >= ms);
  const near = after < 0 ? [series.length - 1] : series[after].timeMs === ms ? [after] : [after - 1, after];
  const gap = (i: number) => Math.abs(series[i].timeMs - ms);
  return near.filter((i) => i >= 0 && gap(i) <= maxGapMin * 60_000).sort((a, b) => gap(a) - gap(b));
}

export type Condition = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

// Name keys for the UI's condition labels (i18n).
export type ConditionName =
  | "clear"
  | "mostlyClear"
  | "partly"
  | "overcast"
  | "fog"
  | "drizzle"
  | "freezingDrizzle"
  | "freezingRain"
  | "lightRain"
  | "rain"
  | "heavyRain"
  | "snow"
  | "storm"
  | "hail"
  | "unknown";

// WMO weather interpretation codes (Open-Meteo docs).
export function conditionOf(code: number): { kind: Condition; name: ConditionName } {
  if (code === 0) return { kind: "clear", name: "clear" };
  if (code === 1) return { kind: "partly", name: "mostlyClear" };
  if (code === 2) return { kind: "partly", name: "partly" };
  if (code === 3) return { kind: "cloudy", name: "overcast" };
  if (code === 45 || code === 48) return { kind: "fog", name: "fog" };
  if (code >= 51 && code <= 57) return { kind: "drizzle", name: code >= 56 ? "freezingDrizzle" : "drizzle" };
  if (code === 66 || code === 67) return { kind: "rain", name: "freezingRain" };
  if ((code >= 61 && code <= 65) || (code >= 80 && code <= 82)) {
    const heavy = code === 65 || code === 82;
    const light = code === 61 || code === 80;
    return { kind: "rain", name: heavy ? "heavyRain" : light ? "lightRain" : "rain" };
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { kind: "snow", name: "snow" };
  if (code >= 95) return { kind: "storm", name: code === 95 ? "storm" : "hail" };
  return { kind: "cloudy", name: "unknown" };
}

// Eight-point compass sector (0 = north, clockwise) for a direction in degrees; the UI names it.
export const compassIndex = (deg: number) => Math.round((((deg % 360) + 360) % 360) / 45) % 8;
