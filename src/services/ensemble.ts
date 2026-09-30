import { ENSEMBLE } from "../config/weather";
import type { LatLon } from "../core/geo";
import { spread } from "../core/weather/weather";
import { getJson } from "./http";
import { round } from "./openmeteo";

const BASE = "https://ensemble-api.open-meteo.com/v1/ensemble";

export interface ModelRange {
  runs: number;
  tempC: { lo: number; hi: number };
  precipMm: { lo: number; hi: number };
}

interface OmEnsemble {
  hourly: Record<string, (number | null)[]>; // temperature_2m, temperature_2m_member01, …
}

// How far the runs of an ensemble model spread for one forecast hour at one point (temperatures at the
// point's own height, like the main forecast). null when the hour is outside the model's range.
export async function fetchModelRange(pos: LatLon, hourMs: number): Promise<ModelRange | null> {
  const hour = new Date(hourMs).toISOString().slice(0, 16); // GMT, the API's default zone
  const url = `${BASE}?latitude=${round(pos.lat)}&longitude=${round(pos.lon)}&hourly=temperature_2m,precipitation&models=${ENSEMBLE.model}&start_hour=${hour}&end_hour=${hour}`;
  const data = await getJson<OmEnsemble>(url, 15000);
  const of = (name: string) =>
    Object.entries(data.hourly)
      .filter(([k]) => k === name || k.startsWith(`${name}_member`))
      .map(([, v]) => v[0])
      .filter((v): v is number => v !== null);
  const temps = of("temperature_2m");
  const rain = of("precipitation");
  if (!temps.length || !rain.length) return null;
  return { runs: temps.length, tempC: spread(temps, ENSEMBLE.lowPct, ENSEMBLE.highPct), precipMm: spread(rain, ENSEMBLE.lowPct, ENSEMBLE.highPct) };
}
