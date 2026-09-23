import { WEATHER_REQUEST } from "../config/weather";
import type { LatLon } from "../core/geo";
import type { Forecast } from "../core/weather/weather";
import { getJson, HttpError } from "./http";

const BASE = "https://api.open-meteo.com/v1/forecast";
const HOURLY =
  "temperature_2m,apparent_temperature,precipitation,precipitation_probability,snowfall,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,visibility,is_day";
const DAY_MS = 86_400_000;

interface OmLocation {
  hourly: {
    time: number[]; // unix seconds (timeformat=unixtime)
    temperature_2m: number[];
    apparent_temperature: number[];
    precipitation: number[];
    precipitation_probability: (number | null)[];
    snowfall: number[];
    weather_code: number[];
    wind_speed_10m: number[];
    wind_gusts_10m: number[];
    wind_direction_10m: number[];
    visibility: number[];
    is_day: number[];
  };
  daily: { sunrise: number[]; sunset: number[] };
}

const round = (v: number) => (Math.round(v / WEATHER_REQUEST.coordRoundDeg) * WEATHER_REQUEST.coordRoundDeg).toFixed(2);

// Hourly forecast for every point, in one request. Covers from `past_hours` ago until `untilMs`.
// Coordinates are rounded so small route changes hit the cache.
// fresh: skip the cache (live mode refresh).
export async function fetchForecast(points: LatLon[], untilMs: number, fresh = false): Promise<Forecast[]> {
  const days = Math.ceil((untilMs - Date.now()) / DAY_MS) + 1;
  if (days > WEATHER_REQUEST.maxForecastDays) throw new Error(`Hava tahmini en fazla ${WEATHER_REQUEST.maxForecastDays - 1} gün ilerisi için var.`);
  const url =
    `${BASE}?latitude=${points.map((p) => round(p.lat)).join(",")}&longitude=${points.map((p) => round(p.lon)).join(",")}` +
    `&hourly=${HOURLY}&daily=sunrise,sunset&timeformat=unixtime&timezone=auto&past_hours=${WEATHER_REQUEST.pastHours}&forecast_days=${Math.max(WEATHER_REQUEST.minForecastDays, days)}`;
  let data: OmLocation | OmLocation[];
  try {
    data = await getJson<OmLocation | OmLocation[]>(url, 15000, fresh);
  } catch (e) {
    if (e instanceof HttpError && e.status === 429) throw new Error("Hava servisi şu an yoğun, biraz sonra tekrar deneyin.");
    throw new Error("Hava durumu alınamadı.");
  }
  // One location comes back as an object, several as an array.
  return (Array.isArray(data) ? data : [data]).map(({ hourly: h, daily: d }) => ({
    sun: d.sunrise.map((rise, i) => ({ riseMs: rise * 1000, setMs: d.sunset[i] * 1000 })),
    hours: h.time.map((t, i) => ({
      timeMs: t * 1000,
      tempC: h.temperature_2m[i],
      feelsC: h.apparent_temperature[i],
      precipMm: h.precipitation[i],
      precipProb: h.precipitation_probability[i],
      snowCm: h.snowfall[i],
      code: h.weather_code[i],
      windKmh: h.wind_speed_10m[i],
      gustKmh: h.wind_gusts_10m[i],
      windFromDeg: h.wind_direction_10m[i],
      visibilityM: h.visibility[i],
      isDay: h.is_day[i] === 1,
    })),
  }));
}
