import type { LatLon } from "../geo";
import type { WeatherHour } from "../weather/weather";
import { angleBetween, sunPosition } from "./sun";

// 0 = no warning, 1 = düşük, 2 = orta, 3 = yüksek
export type Level = 0 | 1 | 2 | 3;
type Triple = [number, number, number];

export interface RiskThresholds {
  rainMm: Triple; // mm in the forecast hour
  rainProbPct: number | null; // low warning from this precipitation probability on, even without forecast rain
  gustKmh: Triple;
  crossGustKmh: Triple | null; // gust part across the direction of travel
  visibilityM: Triple; // at or below
  coldC: Triple | null; // felt temperature at or below
  windChill: boolean; // rider exposed to the relative wind
  iceTempC: number;
  nearFreezingC: number;
  snow: Level;
  storm: Level;
  dark: Level;
  road: { damp: Level; wet: Level };
  glare: Level; // low sun ahead
  heatC: Triple | null; // apparent temperature at or above
}

// Low sun in front of the rider: above the horizon, below maxElevationDeg, within maxAngleDeg of
// the heading, and a sky clear enough to see it (WMO code up to maxCode).
export interface GlareRules {
  maxElevationDeg: number;
  maxAngleDeg: number;
  maxCode: number;
}

export interface WetRoadRules {
  recentHours: number;
  wetNowMm: number;
  wetRecentMm: number;
  dampRecentMm: number;
}

// Warning texts in the UI language (src/i18n); core only decides levels and numbers.
export interface RiskTexts {
  storm: string;
  snow: string;
  rain(level: Level, mm: number, prob: number | null): string;
  rainProb(pct: number): string;
  gust(kmh: number): string;
  crosswind(kmh: number, fromRight: boolean): string;
  visibility(km: number, fog: boolean): string;
  ice(tempC: number): string;
  nearFreezing(tempC: number): string;
  wetRoad: string;
  dampRoad: string;
  cold(feltC: number): string;
  heat(feltC: number, strong: boolean): string;
  dark: string;
  glare(elevationDeg: number): string;
}

export type RiskKind = "storm" | "snow" | "rain" | "gust" | "crosswind" | "visibility" | "ice" | "cold" | "road" | "dark" | "glare" | "heat";
export interface RiskEvent {
  kind: RiskKind;
  level: Level;
  text: string;
}
export type RoadState = "dry" | "damp" | "wet" | "ice";

export interface Assessment {
  level: Level;
  events: RiskEvent[]; // highest level first
  feltC: number; // temperature felt while riding
  road: RoadState; // estimate
  dark: boolean;
}

const RAD = Math.PI / 180;

const above = (v: number, t: Triple): Level => (v >= t[2] ? 3 : v >= t[1] ? 2 : v >= t[0] ? 1 : 0);
const below = (v: number, t: Triple): Level => (v <= t[2] ? 3 : v <= t[1] ? 2 : v <= t[0] ? 1 : 0);

// Wind chill (Environment Canada / NWS 2001). Defined for T <= 10 °C and wind >= 4.8 km/h.
export function windChillC(tempC: number, windKmh: number): number {
  if (tempC > 10 || windKmh < 4.8) return tempC;
  const v = windKmh ** 0.16;
  return 13.12 + 0.6215 * tempC - 11.37 * v + 0.3965 * tempC * v;
}

// Air speed the rider feels: riding speed plus the headwind part of the wind.
// windFromDeg is where the wind comes from; a wind from straight ahead adds fully.
export function relativeWindKmh(rideKmh: number, windKmh: number, windFromDeg: number, headingDeg: number): number {
  return Math.max(0, rideKmh + windKmh * Math.cos((windFromDeg - headingDeg) * RAD));
}

// The part of a wind across the direction of travel, and the side it comes from.
// windFromDeg is where the wind comes from; headingDeg where the rider goes.
export function crosswind(windKmh: number, windFromDeg: number, headingDeg: number): { kmh: number; fromRight: boolean } {
  const s = Math.sin((windFromDeg - headingDeg) * RAD);
  return { kmh: Math.abs(windKmh * s), fromRight: s > 0 };
}

// Wet road estimate from rain now and in the last hours, and temperature.
export function roadState(hours: WeatherHour[], i: number, rules: WetRoadRules, iceTempC: number): RoadState {
  const now = hours[i];
  let recent = 0;
  for (let k = Math.max(0, i - rules.recentHours + 1); k <= i; k++) recent += hours[k].precipMm;
  const wet = now.precipMm >= rules.wetNowMm || recent >= rules.wetRecentMm;
  const damp = now.precipMm > 0 || recent >= rules.dampRecentMm || now.snowCm > 0;
  if ((wet || damp) && now.tempC <= iceTempC) return "ice";
  return wet ? "wet" : damp ? "damp" : "dry";
}

export function isDark(sun: { riseMs: number; setMs: number }[], ms: number): boolean {
  if (!sun.length) return false;
  return !sun.some((d) => ms >= d.riseMs && ms <= d.setMs);
}

export interface PointInput {
  hours: WeatherHour[];
  i: number; // index of the forecast hour matched to the ETA
  etaMs: number;
  rideKmh: number;
  headingDeg: number;
  sun: { riseMs: number; setMs: number }[];
  pos: LatLon;
}

export function assessPoint(p: PointInput, t: RiskThresholds, wet: WetRoadRules, glare: GlareRules, tx: RiskTexts): Assessment {
  const h = p.hours[p.i];
  const events: RiskEvent[] = [];
  const add = (kind: RiskKind, level: Level, text: string) => level > 0 && events.push({ kind, level, text });

  if (h.code >= 95) add("storm", t.storm, tx.storm);
  if (h.snowCm > 0 || (h.code >= 71 && h.code <= 77) || h.code === 85 || h.code === 86) add("snow", t.snow, tx.snow);
  else {
    // The probability (ensemble based) says how sure the rain amount is; a high one alone is a low warning.
    const rain = above(h.precipMm, t.rainMm);
    if (rain > 0) add("rain", rain, tx.rain(rain, h.precipMm, h.precipProb));
    else if (t.rainProbPct !== null && h.precipProb !== null && h.precipProb >= t.rainProbPct) add("rain", 1, tx.rainProb(h.precipProb));
  }
  // A gust from the side pushes a bike across the lane: warned on its own. When it is at least as
  // serious as the plain gust warning, it replaces it (one wind, one row).
  const gust = above(h.gustKmh, t.gustKmh);
  const side = crosswind(h.gustKmh, h.windFromDeg, p.headingDeg);
  const cross = t.crossGustKmh ? above(side.kmh, t.crossGustKmh) : 0;
  if (cross > 0 && cross >= gust) add("crosswind", cross, tx.crosswind(side.kmh, side.fromRight));
  else add("gust", gust, tx.gust(h.gustKmh));
  const fog = h.code === 45 || h.code === 48;
  // The fog code alone is a low warning; the forecast visibility decides anything higher.
  const vis = Math.max(below(h.visibilityM, t.visibilityM), fog ? 1 : 0) as Level;
  add("visibility", vis, tx.visibility(h.visibilityM / 1000, fog));

  const road = roadState(p.hours, p.i, wet, t.iceTempC);
  if (road === "ice") add("ice", 3, tx.ice(h.tempC));
  else {
    if (h.tempC <= t.nearFreezingC) add("ice", 2, tx.nearFreezing(h.tempC));
    if (road === "wet") add("road", t.road.wet, tx.wetRoad);
    if (road === "damp") add("road", t.road.damp, tx.dampRoad);
  }

  const feltC = t.windChill ? windChillC(h.tempC, relativeWindKmh(p.rideKmh, h.windKmh, h.windFromDeg, p.headingDeg)) : h.feelsC;
  if (t.coldC) add("cold", below(feltC, t.coldC), tx.cold(feltC));

  if (t.heatC) {
    const heat = above(h.feelsC, t.heatC);
    add("heat", heat, tx.heat(h.feelsC, heat >= 2));
  }

  const dark = isDark(p.sun, p.etaMs);
  if (dark) add("dark", t.dark, tx.dark);
  else if (h.code <= glare.maxCode) {
    const s = sunPosition(p.etaMs, p.pos.lat, p.pos.lon);
    if (s.elevationDeg > 0 && s.elevationDeg <= glare.maxElevationDeg && angleBetween(s.azimuthDeg, p.headingDeg) <= glare.maxAngleDeg)
      add("glare", t.glare, tx.glare(s.elevationDeg));
  }

  events.sort((a, b) => b.level - a.level);
  return { level: (events[0]?.level ?? 0) as Level, events, feltC, road, dark };
}

export type BreakAdvice = { kind: "rainStarts"; atMin: number } | { kind: "rainStops"; extendMin: number } | null;

// Rain during a break, from the hourly forecast at the break: either rain starts while stopped
// (leave earlier), or it rains when the break ends and stops soon after (stay longer).
export function breakAdvice(hours: WeatherHour[], startMs: number, endMs: number, rainMm: number, maxExtendMin: number): BreakAdvice {
  const wetAt = (ms: number) => {
    let best: WeatherHour | undefined;
    for (const h of hours) if (!best || Math.abs(h.timeMs - ms) < Math.abs(best.timeMs - ms)) best = h;
    return !!best && best.precipMm >= rainMm;
  };
  if (!hours.length) return null;
  if (!wetAt(startMs)) {
    const turn = hours.find((h) => h.timeMs > startMs && h.timeMs <= endMs && h.precipMm >= rainMm);
    // The forecast hour starts to apply half-way between marks.
    if (turn) return { kind: "rainStarts", atMin: Math.max(0, Math.round((turn.timeMs - 30 * 60_000 - startMs) / 60_000)) };
    return null;
  }
  if (wetAt(endMs)) {
    const dry = hours.find((h) => h.timeMs > endMs && h.timeMs <= endMs + maxExtendMin * 60_000 && h.precipMm < rainMm);
    if (dry) return { kind: "rainStops", extendMin: Math.max(1, Math.round((dry.timeMs - 30 * 60_000 - endMs) / 60_000)) };
  }
  return null;
}
