import type { LatLon } from "../geo";

export type PoiKind = "fuel" | "services" | "rest";

export interface Poi {
  id: string;
  kind: PoiKind;
  name: string;
  pos: LatLon;
  sheltered: boolean; // somewhere to stand under a roof
  named: boolean; // false when the name is only the kind
}

// OSM tags to a stop. Fuel stations have a canopy; motorway services have buildings; a plain
// rest area only counts as sheltered when it is tagged with a shelter, toilets building or shop.
export function classifyPoi(id: string, pos: LatLon, tags: Record<string, string>): Poi | null {
  const kind: PoiKind | null =
    tags.amenity === "fuel" ? "fuel" : tags.highway === "services" ? "services" : tags.highway === "rest_area" ? "rest" : null;
  if (!kind) return null;
  const sheltered = kind !== "rest" || tags.shelter === "yes" || !!tags.shop || !!tags.building;
  const name = tags.name ?? tags.brand;
  return { id, kind, name: name ?? "", pos, sheltered, named: !!name }; // unnamed: the UI shows the kind
}

export interface StopOnRoute extends Poi {
  distM: number; // along the route
  recommended: boolean; // sheltered and in rain or cold
}

// Orders stops along the route and thins them: of each kind, a stop is kept only if it is at least
// minGapM after the previous kept one of that kind. In rain or cold, stops without shelter are left
// out and the sheltered ones are marked as recommended.
export function pickStops(stops: (Poi & { distM: number })[], badWeatherAt: (distM: number) => boolean, minGapM: number): StopOnRoute[] {
  const lastKept: Partial<Record<PoiKind, number>> = {};
  const out: StopOnRoute[] = [];
  for (const s of [...stops].sort((a, b) => a.distM - b.distM)) {
    const bad = badWeatherAt(s.distM);
    if (bad && !s.sheltered) continue;
    const last = lastKept[s.kind];
    if (last !== undefined && s.distM - last < minGapM) continue;
    const recommended = bad;
    lastKept[s.kind] = s.distM;
    out.push({ ...s, recommended });
  }
  return out;
}

// Stretches longer than the fuel range between two places to fill up: the start (a full tank is
// assumed), every fuel stop along the route, and the arrival. Distances along the route, metres.
export function fuelGaps(fuelM: number[], totalM: number, rangeM: number): { fromM: number; toM: number }[] {
  const at = [0, ...fuelM.filter((d) => d > 0 && d < totalM).sort((a, b) => a - b), totalM];
  const out: { fromM: number; toM: number }[] = [];
  for (let i = 1; i < at.length; i++) if (at[i] - at[i - 1] > rangeM) out.push({ fromM: at[i - 1], toM: at[i] });
  return out;
}
