import { t } from "../i18n";
import { fromLonLat, type LatLon } from "../core/geo";
import { getJson } from "./http";

// Photon (komoot) is built for search-as-you-type; Nominatim's policy forbids client-side autocomplete.
const BASE = "https://photon.komoot.io/api/";

export interface Place {
  label: string;
  pos: LatLon;
}

interface PhotonResponse {
  features: { geometry: { coordinates: number[] }; properties: Record<string, string | undefined> }[];
}

// "Name, street no, district, city, state, country" without empty or repeated parts.
export function placeLabel(p: Record<string, string | undefined>): string {
  const street = p.street ? [p.street, p.housenumber].filter(Boolean).join(" ") : undefined;
  const parts = [p.name, street, p.district, p.city, p.state, p.country].filter((x): x is string => !!x);
  return parts.filter((x, i) => parts.indexOf(x) === i).join(", ");
}

// near: bias results towards the map centre, like a map app does.
export async function searchPlaces(query: string, near?: LatLon): Promise<Place[]> {
  const bias = near ? `&lat=${near.lat.toFixed(3)}&lon=${near.lon.toFixed(3)}` : "";
  const url = `${BASE}?limit=5&lang=default&q=${encodeURIComponent(query)}${bias}`;
  try {
    const r = await getJson<PhotonResponse>(url);
    return r.features.map((f) => ({ label: placeLabel(f.properties), pos: fromLonLat(f.geometry.coordinates) }));
  } catch {
    throw new Error(t.errors.searchFailed);
  }
}

// The place nearest a point, within 10 km so a point in the fields still gets its village. Null
// when there is nothing near or the request fails.
async function reverse(pos: LatLon): Promise<Record<string, string | undefined> | null> {
  const url = `${BASE.replace("/api/", "/reverse")}?limit=1&lang=default&radius=10&lat=${pos.lat.toFixed(5)}&lon=${pos.lon.toFixed(5)}`;
  try {
    return (await getJson<PhotonResponse>(url)).features[0]?.properties ?? null;
  } catch {
    return null;
  }
}

// Address of a point for the place card and stops set on the map.
export async function reverseLabel(pos: LatLon): Promise<string | null> {
  const p = await reverse(pos);
  return p ? placeLabel(p) || null : null;
}

// City of a place. In Türkiye Photon's city is the district and its state the province, the city
// people name.
export function cityOf(p: Record<string, string | undefined>): string | null {
  return (p.countrycode === "TR" ? (p.state ?? p.city) : (p.city ?? p.state)) ?? null;
}

// City of a point, for the ends of the weather strip.
export async function reverseCity(pos: LatLon): Promise<string | null> {
  const p = await reverse(pos);
  return p ? cityOf(p) : null;
}
