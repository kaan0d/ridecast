import { ENSEMBLE, LAPSE_C_PER_KM, WEATHER_REQUEST } from "../config/weather";
import type { LatLon } from "../core/geo";
import { spread } from "../core/weather/weather";
import { getJson } from "./http";

const BASE = "https://ensemble-api.open-meteo.com/v1/ensemble";

export interface ModelRange {
  runs: number;
  tempC: { lo: number; hi: number };
  precipMm: { lo: number; hi: number };
}

interface OmEnsemble {
  elevation: number;
  hourly: Record<string, (number | null)[]>; // temperature_2m, temperature_2m_member01, …
}

// How far the runs of an ensemble model spread for one forecast hour at one point. Temperatures are
// moved to the road's height like the main forecast. null when the hour is outside the model's range.
export async function fetchModelRange(pos: LatLon, hourMs: number, roadM?: number): Promise<ModelRange | null> {
  const round = (v: number) => (Math.round(v / WEATHER_REQUEST.coordRoundDeg) * WEATHER_REQUEST.coordRoundDeg).toFixed(2);
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
  const d = roadM === undefined ? 0 : ((data.elevation - roadM) * LAPSE_C_PER_KM) / 1000;
  const t = spread(temps, ENSEMBLE.lowPct, ENSEMBLE.highPct);
  return { runs: temps.length, tempC: { lo: t.lo + d, hi: t.hi + d }, precipMm: spread(rain, ENSEMBLE.lowPct, ENSEMBLE.highPct) };
}
