// Display units: metric, or imperial (miles, mph, °F, inches, feet). Everything inside the app stays
// metric; only what is shown and typed is converted. A per-browser choice like the language.

export type Units = "metric" | "imperial";

const KEY = "ridecast.units";
const MI_M = 1609.344;
const KMH_PER_MPH = 1.609344;

// Metric unless chosen otherwise; a US browser starts in imperial.
function stored(): Units {
  if (typeof localStorage === "undefined") return "metric"; // tests: the app's own units
  try {
    const v = localStorage.getItem(KEY);
    if (v === "metric" || v === "imperial") return v;
  } catch {
    // storage blocked: fall through to the browser language
  }
  return typeof navigator !== "undefined" && navigator.language === "en-US" ? "imperial" : "metric";
}

export const units: Units = stored();

export function setUnits(v: Units) {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // not remembered
  }
  location.reload();
}

// One decimal under 10, whole above (the same rule for km and miles).
const fix = (v: number) => v.toFixed(Math.abs(v) < 10 ? 1 : 0);

// `kmh`: the metric speed unit in the page language (km/h, km/sa).
export function unitsOf(u: Units, kmh = "km/h") {
  const imp = u === "imperial";
  return {
    distUnit: imp ? "mi" : "km",
    speedUnit: imp ? "mph" : kmh,
    dist: (m: number) => `${fix(imp ? m / MI_M : m / 1000)} ${imp ? "mi" : "km"}`,
    // Whole km or miles for "km 12" style positions.
    distWhole: (m: number) => Math.round(imp ? m / MI_M : m / 1000),
    speed: (v: number) => `${Math.round(imp ? v / KMH_PER_MPH : v)} ${imp ? "mph" : kmh}`,
    speedNum: (v: number) => Math.round(imp ? v / KMH_PER_MPH : v),
    temp: (c: number) => `${Math.round(imp ? (c * 9) / 5 + 32 : c)}°`,
    rain: (mm: number) => (imp ? `${(mm / 25.4).toFixed(2)} in` : `${mm.toFixed(1)} mm`),
    snow: (cm: number) => (imp ? `${(cm / 2.54).toFixed(1)} in` : `${cm.toFixed(1)} cm`),
    height: (m: number) => `${Math.round(imp ? m / 0.3048 : m)} ${imp ? "ft" : "m"}`,
    // Typed values: speeds and distances as the viewer reads them, converted back to metric.
    kmhFrom: (v: number) => (imp ? v * KMH_PER_MPH : v),
    kmFrom: (v: number) => (imp ? (v * MI_M) / 1000 : v),
    kmTo: (km: number) => (imp ? (km * 1000) / MI_M : km),
  };
}

