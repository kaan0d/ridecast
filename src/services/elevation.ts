import { t } from "../i18n";
import type { LatLon } from "../core/geo";
import { getJson } from "./http";

const BASE = "https://api.open-meteo.com/v1/elevation";

// Ground height (m) at each point, in one request (at most 100 points). Coordinates keep 4
// decimals (~10 m), finer than the terrain model, so the same route hits the cache.
export async function fetchElevation(points: LatLon[]): Promise<number[]> {
  const url = `${BASE}?latitude=${points.map((p) => p.lat.toFixed(4)).join(",")}&longitude=${points.map((p) => p.lon.toFixed(4)).join(",")}`;
  try {
    return (await getJson<{ elevation: number[] }>(url, 15000)).elevation;
  } catch {
    throw new Error(t.errors.elevationDown);
  }
}
