import type { VehicleType } from "../config/vehicles";
import type { LatLon } from "../core/geo";
import { getRoutes, type Route } from "./osrm";
import { getValhallaRoutes } from "./valhalla";

export interface Avoid {
  highways: boolean;
  tolls: boolean;
  ferries: boolean;
}

// Plain trips go to OSRM (fast, alternatives): the demo server for motor vehicles, the FOSSGIS
// bike and foot profiles otherwise. Avoid options need Valhalla; OSRM's public servers answer
// "Exclude flag combination is not supported".
const PROFILE: Record<VehicleType, { osrm: string; costing: string; avoid: (keyof Avoid)[] }> = {
  motorcycle: { osrm: "https://router.project-osrm.org/route/v1/driving", costing: "motorcycle", avoid: ["highways", "tolls", "ferries"] },
  car: { osrm: "https://router.project-osrm.org/route/v1/driving", costing: "auto", avoid: ["highways", "tolls", "ferries"] },
  bicycle: { osrm: "https://routing.openstreetmap.de/routed-bike/route/v1/driving", costing: "bicycle", avoid: ["ferries"] },
  walking: { osrm: "https://routing.openstreetmap.de/routed-foot/route/v1/driving", costing: "pedestrian", avoid: ["ferries"] },
};

// Avoid options that apply to this vehicle.
export const avoidFor = (v: VehicleType) => PROFILE[v].avoid;

// Same key = same request: used to re-route only when vehicle or avoid options change the route.
export function routingKey(v: VehicleType, avoid: Avoid): string {
  const on = PROFILE[v].avoid.filter((k) => avoid[k]);
  return on.length ? `${PROFILE[v].costing}:${on.join(",")}` : PROFILE[v].osrm;
}

export function routeTrip(stops: LatLon[], v: VehicleType, avoid: Avoid): Promise<Route[]> {
  const p = PROFILE[v];
  const on = p.avoid.filter((k) => avoid[k]);
  if (!on.length) return getRoutes(stops, p.osrm);
  const options: Record<string, number> = {};
  if (on.includes("highways")) options.use_highways = 0;
  if (on.includes("tolls")) options.use_tolls = 0;
  if (on.includes("ferries")) options.use_ferry = 0;
  return getValhallaRoutes(stops, p.costing, options);
}
