import { t } from "../i18n";
import type { LatLon } from "../core/geo";
import { decodePolyline } from "../core/route/polyline";
import { getJson, HttpError } from "./http";
import type { Route } from "./osrm";

const BASE = "https://valhalla1.openstreetmap.de/route";

interface ValhallaTrip {
  legs: {
    shape: string; // polyline, precision 6
    maneuvers: { length: number; time: number; street_names?: string[]; travel_type?: string; type: number }[];
  }[];
  summary: { length: number; time: number }; // km, s
}

const FERRY_ENTER = 28; // Valhalla maneuver type "enter ferry"

// Valhalla (FOSSGIS public server) for trips with avoid options, which OSRM's public servers do
// not support. Maneuvers become steps; street names carry the O-/D- refs the road type guess reads.
export async function getValhallaRoutes(stops: LatLon[], costing: string, options: Record<string, number>): Promise<Route[]> {
  const body = {
    locations: stops.map((p) => ({ lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6) })),
    costing,
    costing_options: { [costing]: options },
    units: "kilometers",
    alternates: stops.length === 2 ? 2 : 0,
  };
  let data: { trip: ValhallaTrip; alternates?: { trip: ValhallaTrip }[] };
  try {
    data = await getJson(`${BASE}?json=${encodeURIComponent(JSON.stringify(body))}`, 30000);
  } catch (e) {
    if (e instanceof HttpError && e.status === 400) throw new Error(t.errors.avoidNoRoute);
    if (e instanceof HttpError && e.status === 429) throw new Error(t.errors.routeBusy);
    throw new Error(t.errors.routeDown);
  }
  return [data.trip, ...(data.alternates ?? []).map((a) => a.trip)].map(toRoute);
}

function toRoute(t: ValhallaTrip): Route {
  const coords: LatLon[] = [];
  t.legs.forEach((leg, i) => coords.push(...decodePolyline(leg.shape).slice(i === 0 ? 0 : 1)));
  return {
    coords,
    distanceM: t.summary.length * 1000,
    durationS: t.summary.time,
    steps: t.legs.flatMap((leg, i) =>
      leg.maneuvers.map((m) => ({
        distanceM: m.length * 1000,
        durationS: m.time,
        ref: (m.street_names ?? []).join(" "),
        ferry: m.travel_type === "ferry" || m.type === FERRY_ENTER,
        leg: i,
      })),
    ),
  };
}
