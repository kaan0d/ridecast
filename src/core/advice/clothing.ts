import type { Assessment } from "../risk/risk";
import type { WeatherHour } from "../weather/weather";

// Worst conditions met along the route, the input for the clothing table.
export interface RouteConditions {
  minFeltC: number;
  maxTempC: number;
  maxPrecipMm: number;
  wetRoad: boolean;
  maxGustKmh: number;
  minVisibilityM: number;
  dark: boolean;
  snow: boolean;
  ice: boolean;
}

export function summarize(points: { hour: WeatherHour | null; risk: Assessment | null }[]): RouteConditions | null {
  const known = points.filter((p) => p.hour && p.risk) as { hour: WeatherHour; risk: Assessment }[];
  if (!known.length) return null;
  return {
    minFeltC: Math.min(...known.map((p) => p.risk.feltC)),
    maxTempC: Math.max(...known.map((p) => p.hour.tempC)),
    maxPrecipMm: Math.max(...known.map((p) => p.hour.precipMm)),
    wetRoad: known.some((p) => p.risk.road === "wet" || p.risk.road === "ice"),
    maxGustKmh: Math.max(...known.map((p) => p.hour.gustKmh)),
    minVisibilityM: Math.min(...known.map((p) => p.hour.visibilityM)),
    dark: known.some((p) => p.risk.dark),
    snow: known.some((p) => p.hour.snowCm > 0),
    ice: known.some((p) => p.risk.road === "ice" || p.risk.events.some((e) => e.kind === "ice")),
  };
}

// One row of the clothing table. Every condition given must hold; the rule applies to the
// listed vehicles only.
export interface ClothingRule<V extends string = string> {
  item: string;
  vehicles: readonly V[];
  feltAtMostC?: number;
  tempAtLeastC?: number;
  precipAtLeastMm?: number;
  wetRoad?: true;
  gustAtLeastKmh?: number;
  visibilityAtMostM?: number;
  dark?: true;
  snowOrIce?: true;
}

export interface ClothingItem {
  item: string;
  why: string;
}

// Rules are checked in table order; a rule with rain matches rain or a wet road.
export function clothingFor<V extends string>(c: RouteConditions, vehicle: V, rules: readonly ClothingRule<V>[]): ClothingItem[] {
  const out: ClothingItem[] = [];
  for (const r of rules) {
    if (!r.vehicles.includes(vehicle)) continue;
    const why: string[] = [];
    if (r.feltAtMostC !== undefined) {
      if (c.minFeltC > r.feltAtMostC) continue;
      why.push(`hissedilen en düşük ${Math.round(c.minFeltC)}°`);
    }
    if (r.tempAtLeastC !== undefined) {
      if (c.maxTempC < r.tempAtLeastC) continue;
      why.push(`en yüksek ${Math.round(c.maxTempC)}°`);
    }
    if (r.precipAtLeastMm !== undefined) {
      if (c.maxPrecipMm < r.precipAtLeastMm && !c.wetRoad) continue;
      why.push(c.maxPrecipMm >= r.precipAtLeastMm ? `yağış ${c.maxPrecipMm.toFixed(1)} mm/sa` : "ıslak yol");
    }
    if (r.wetRoad && !c.wetRoad) continue;
    if (r.wetRoad) why.push("ıslak yol");
    if (r.gustAtLeastKmh !== undefined) {
      if (c.maxGustKmh < r.gustAtLeastKmh) continue;
      why.push(`hamle ${Math.round(c.maxGustKmh)} km/s`);
    }
    if (r.visibilityAtMostM !== undefined) {
      if (c.minVisibilityM > r.visibilityAtMostM) continue;
      why.push(`görüş ${(c.minVisibilityM / 1000).toFixed(1)} km`);
    }
    if (r.dark && !c.dark) continue;
    if (r.dark) why.push("karanlıkta sürüş");
    if (r.snowOrIce && !(c.snow || c.ice)) continue;
    if (r.snowOrIce) why.push(c.snow ? "kar" : "buzlanma riski");
    // The same item from two rules shows once, with both reasons.
    const seen = out.find((o) => o.item === r.item);
    if (seen) seen.why = [seen.why, ...why].filter(Boolean).join(", ");
    else out.push({ item: r.item, why: why.join(", ") });
  }
  return out;
}
