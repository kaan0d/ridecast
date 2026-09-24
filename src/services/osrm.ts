import { t } from "../i18n";
import { fromLonLat, toLonLatString, type LatLon } from "../core/geo";
import type { Step } from "../core/route/roadType";
import { getJson, HttpError } from "./http";

export interface Route {
  coords: LatLon[];
  distanceM: number;
  durationS: number;
  steps: Step[];
}

interface OsrmResponse {
  code: string;
  routes?: {
    distance: number;
    duration: number;
    geometry: { coordinates: number[][] };
    legs: { steps: { distance: number; duration: number; mode: string; ref?: string }[] }[];
  }[];
}

// OSRM only returns alternatives for routes with exactly two stops. `base` picks the server and
// profile (see services/routing.ts).
export async function getRoutes(stops: LatLon[], base: string): Promise<Route[]> {
  const url = `${base}/${stops.map(toLonLatString).join(";")}?alternatives=true&overview=full&geometries=geojson&steps=true`;
  let data: OsrmResponse;
  try {
    data = await getJson<OsrmResponse>(url);
  } catch (e) {
    // OSRM answers 400 for points it cannot snap to a road.
    if (e instanceof HttpError && e.status === 400) throw new Error(t.errors.noRoute);
    if (e instanceof HttpError && e.status === 429) throw new Error(t.errors.routeBusy);
    throw new Error(t.errors.routeDown);
  }
  if (data.code !== "Ok" || !data.routes?.length) throw new Error(t.errors.noRoute);
  return data.routes.map((r) => ({
    coords: r.geometry.coordinates.map(fromLonLat),
    distanceM: r.distance,
    durationS: r.duration,
    steps: r.legs.flatMap((leg, i) =>
      leg.steps.map((s) => ({ distanceM: s.distance, durationS: s.duration, ref: s.ref ?? "", ferry: s.mode === "ferry", leg: i })),
    ),
  }));
}
