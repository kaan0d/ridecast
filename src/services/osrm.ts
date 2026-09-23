import { fromLonLat, toLonLatString, type LatLon } from "../core/geo";
import { getJson, HttpError } from "./http";

const BASE = "https://router.project-osrm.org/route/v1/driving";

export interface Route {
  coords: LatLon[];
  distanceM: number;
  durationS: number;
}

interface OsrmResponse {
  code: string;
  routes?: { distance: number; duration: number; geometry: { coordinates: number[][] } }[];
}

// OSRM only returns alternatives for routes with exactly two stops.
export async function getRoutes(stops: LatLon[]): Promise<Route[]> {
  const url = `${BASE}/${stops.map(toLonLatString).join(";")}?alternatives=true&overview=full&geometries=geojson`;
  let data: OsrmResponse;
  try {
    data = await getJson<OsrmResponse>(url);
  } catch (e) {
    // OSRM answers 400 for points it cannot snap to a road.
    if (e instanceof HttpError && e.status === 400) throw new Error("Rota bulunamadı.");
    if (e instanceof HttpError && e.status === 429) throw new Error("Rota sunucusu yoğun, biraz sonra tekrar deneyin.");
    throw new Error("Rota sunucusuna ulaşılamadı.");
  }
  if (data.code !== "Ok" || !data.routes?.length) throw new Error("Rota bulunamadı.");
  return data.routes.map((r) => ({
    coords: r.geometry.coordinates.map(fromLonLat),
    distanceM: r.distance,
    durationS: r.duration,
  }));
}
