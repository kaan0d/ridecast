import { t } from "../i18n";
import { DEPARTURE } from "../config/departure";
import { GLARE, RISK, RISK_WEIGHTS, WET_ROAD } from "../config/risk";
import type { VehicleType } from "../config/vehicles";
import { WEATHER_REQUEST, WEATHER_SAMPLE } from "../config/weather";
import { departureCandidates, type ScoredDeparture } from "../core/advice/departure";
import { buildTimeline, etaAtDistance, speedAtDistance, type Break, type SpeedSetting, type Timeline } from "../core/eta/eta";
import type { LatLon } from "../core/geo";
import { assessPoint } from "../core/risk/risk";
import { routeScore } from "../core/risk/route";
import { bearingAt, pointAtDistance, type Line } from "../core/route/line";
import { bracketHours, sampleDistances, type Forecast } from "../core/weather/weather";
import { fetchForecast } from "../services/openmeteo";
import type { Route } from "../services/osrm";
import type { WeatherPoint } from "./weather";

export interface RouteView {
  route: Route;
  line: Line;
  scale: number; // line metres to step metres
}

export type Sample = { distM: number; pos: LatLon };

// Forecast and risk along one route, from its geometry and a timeline.
export function createForecast(deps: { view(i: number): RouteView; breaks(i: number): Break[]; fresh(): boolean }) {
  // Sample points of a route: fixed by the route itself, not by speed or departure.
  function samplesOf(i: number): Sample[] {
    const { route, line, scale } = deps.view(i);
    return sampleDistances(route.distanceM, route.durationS, WEATHER_SAMPLE.intervalMin, WEATHER_SAMPLE.maxPoints).map((d) => ({
      distM: d,
      pos: pointAtDistance(line, d / scale),
    }));
  }

  // Risk at each sample point for one timeline (one departure time), from the worse of the two
  // forecast hours around the ETA (the nearer one on a tie).
  function assess(i: number, tl: Timeline, vehicle: VehicleType, samples: Sample[], forecasts: Forecast[]): WeatherPoint[] {
    const { line, scale } = deps.view(i);
    return samples.map((s, k): WeatherPoint => {
      const etaMs = etaAtDistance(tl, s.distM);
      const f = forecasts[k] ?? { hours: [] };
      const around = bracketHours(f.hours, etaMs, WEATHER_REQUEST.maxHourGapMin);
      if (!around.length) return { ...s, etaMs, hour: null, risk: null };
      const rideKmh = speedAtDistance(tl, s.distM);
      const headingDeg = bearingAt(line, s.distM / scale);
      const worst = around
        .map((i) => ({ i, risk: assessPoint({ hours: f.hours, i, etaMs, rideKmh, headingDeg, pos: s.pos }, RISK[vehicle], WET_ROAD, GLARE, t.risk) }))
        .reduce((a, b) => (b.risk.level > a.risk.level ? b : a));
      return { ...s, etaMs, hour: f.hours[worst.i], risk: worst.risk };
    });
  }

  // Riding speed at each point weights it by the time spent there (see routeScore).
  const scoreOf = (i: number, tl: Timeline, points: WeatherPoint[]) =>
    routeScore(
      points.map((p) => ({ distM: p.distM, level: p.risk ? p.risk.level : null, kmh: speedAtDistance(tl, p.distM) })),
      deps.view(i).route.distanceM,
      RISK_WEIGHTS,
    );

  // The request is keyed by rounded coordinates and a minimum forecast length, so ETA-only changes
  // and departure candidates are served from the cache.
  async function pointsFor(i: number, tl: Timeline, vehicle: VehicleType, untilMs = 0) {
    const samples = samplesOf(i);
    const lastEta = etaAtDistance(tl, deps.view(i).route.distanceM);
    const forecasts = await fetchForecast(
      samples.map((p) => p.pos),
      Math.max(lastEta, untilMs),
      deps.fresh(),
    );
    return { samples, forecasts, points: assess(i, tl, vehicle, samples, forecasts) };
  }

  // Scores route i for every full-hour departure in the next `windowH` hours, from one forecast.
  function scoreDepartures(i: number, vehicle: VehicleType, speed: SpeedSetting, samples: Sample[], forecasts: Forecast[], windowH: number): ScoredDeparture[] {
    return departureCandidates(Date.now(), windowH, DEPARTURE.stepH).map((departMs) => {
      const tl = buildTimeline(deps.view(i).route.steps, departMs, speed, deps.breaks(i));
      return { departMs, arrivalMs: tl.timeMs[tl.timeMs.length - 1], score: scoreOf(i, tl, assess(i, tl, vehicle, samples, forecasts)) };
    });
  }

  const sampleCount = (i: number) => {
    const { route } = deps.view(i);
    return sampleDistances(route.distanceM, route.durationS, WEATHER_SAMPLE.intervalMin, WEATHER_SAMPLE.maxPoints).length;
  };

  return { pointsFor, scoreOf, scoreDepartures, sampleCount };
}
