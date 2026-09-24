import { t } from "../i18n";
import { classifyPoi, type Poi } from "../core/advice/stops";
import type { Box } from "../core/route/line";
import { HttpError, postFormJson } from "./http";

const URL = "https://overpass-api.de/api/interpreter";

interface OverpassResponse {
  elements: OverpassElement[];
  remark?: string; // set when the server gave up (e.g. its own timeout) and the list is partial
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

// Fuel stations, motorway services and rest areas inside the boxes; the caller keeps the ones close
// to the route. The public server is for light use: this runs only when asked, cached per query.
export async function fetchStops(boxes: Box[]): Promise<Poi[]> {
  const bb = boxes.map((b) => [b.south, b.west, b.north, b.east].map((v) => v.toFixed(4)).join(","));
  const parts = bb.flatMap((b) => [`nwr["amenity"="fuel"](${b});`, `nwr["highway"~"^(services|rest_area)$"](${b});`]);
  const query = `[out:json][timeout:25];(${parts.join("")});out center tags;`;
  let data: OverpassResponse;
  try {
    data = await postFormJson(URL, `data=${encodeURIComponent(query)}`, 30000);
  } catch (e) {
    if (e instanceof HttpError && (e.status === 429 || e.status === 504)) throw new Error(t.errors.stopsBusy);
    throw new Error(t.errors.stopsDown);
  }
  if (data.remark) throw new Error(t.errors.stopsPartial);
  return data.elements.flatMap((e) => {
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (lat === undefined || lon === undefined || !e.tags) return [];
    const poi = classifyPoi(`${e.type}/${e.id}`, { lat, lon }, e.tags);
    return poi ? [poi] : [];
  });
}
