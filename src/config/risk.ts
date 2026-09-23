import type { RiskThresholds } from "../core/risk/risk";
import type { VehicleType } from "./vehicles";

// Every risk threshold lives here. Triples are [low, medium, high].
// Motorcycle is the most sensitive: it warns earliest for rain, wind, cold and wet roads.
export const RISK: Record<VehicleType, RiskThresholds> = {
  motorcycle: {
    rainMm: [0.1, 1, 4],
    gustKmh: [35, 50, 65],
    visibilityM: [5000, 2000, 800],
    coldC: [10, 5, 0], // wind chill at riding speed, at or below
    windChill: true,
    iceTempC: 1,
    nearFreezingC: 3,
    snow: 3,
    storm: 3,
    dark: 2,
    road: { damp: 1, wet: 2 },
  },
  bicycle: {
    rainMm: [0.1, 1, 4],
    gustKmh: [25, 40, 55],
    visibilityM: [3000, 1000, 500],
    coldC: [5, 0, -5],
    windChill: true,
    iceTempC: 1,
    nearFreezingC: 3,
    snow: 3,
    storm: 3,
    dark: 2,
    road: { damp: 1, wet: 2 },
  },
  car: {
    rainMm: [1, 4, 10],
    gustKmh: [50, 70, 90],
    visibilityM: [2000, 1000, 300],
    coldC: null, // enclosed: no wind chill warnings
    windChill: false,
    iceTempC: 1,
    nearFreezingC: 2,
    snow: 2,
    storm: 2,
    dark: 1,
    road: { damp: 0, wet: 1 },
  },
  walking: {
    rainMm: [0.5, 2, 6],
    gustKmh: [40, 60, 80],
    visibilityM: [1000, 500, 200],
    coldC: [5, 0, -5],
    windChill: true,
    iceTempC: 1,
    nearFreezingC: 2,
    snow: 2,
    storm: 3,
    dark: 1,
    road: { damp: 0, wet: 1 },
  },
};

export const WET_ROAD = {
  recentHours: 3, // forecast hours up to the ETA counted for the wet road estimate
  wetNowMm: 0.5,
  wetRecentMm: 1.5,
  dampRecentMm: 0.2,
};

// A break gets advice when rain starts within it, or stops within this many minutes after it.
export const BREAK_ADVICE = { rainMm: 0.1, maxExtendMin: 90 };

// Route risk score: distance-weighted mean of these weights per level (none, low, medium, high).
// Squared-ish steps so a stretch of high risk outweighs a long stretch of low risk.
export const RISK_WEIGHTS = [0, 1, 3, 9] as const;

// The safest route is only suggested over the fastest when its score is at least this much lower.
export const SAFEST_MIN_DROP = 0.1;
