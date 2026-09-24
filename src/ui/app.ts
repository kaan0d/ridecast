import { DEFAULT_BREAK_MIN } from "../config/breaks";
import { WEATHER_REQUEST, WEATHER_SAMPLE } from "../config/weather";
import { GPX_TRACK_KMH, ROAD_TYPE_RULES } from "../config/vehicles";
import { autoBreakDistances, buildTimeline, etaAtDistance, speedAtDistance, totalS, type AutoBreakRule, type Break, type Timeline } from "../core/eta/eta";
import { assessPoint, breakAdvice, type Level } from "../core/risk/risk";
import { BREAK_ADVICE, GLARE, RISK, RISK_WEIGHTS, WET_ROAD } from "../config/risk";
import { routeScore, type RouteScore } from "../core/risk/route";
import type { VehicleType } from "../config/vehicles";
import { type LatLon } from "../core/geo";
import { parseGpx, toGpx } from "../core/route/gpx";
import { bearingAt, labelPoint, lineLength, makeLine, pointAtDistance, sliceLine, snapToLine, type Line } from "../core/route/line";
import { roadBreakdown } from "../core/route/roadType";
import { nearestHourIndex, sampleDistances, type Forecast } from "../core/weather/weather";
import { fetchForecast } from "../services/openmeteo";
import { cardHtml, collectWarnings, pinHtml, renderStrip, renderWarnings, type WeatherPoint } from "./weather";
import type { BreakRow } from "./breaks";
import { renderClothing } from "./advice";
import { createLive } from "./live";
import type { TripState } from "../core/share/state";
import { SHARE } from "../config/share";
import { createStopsPanel } from "./stops";
import { reverseLabel } from "../services/nominatim";
import type { Route } from "../services/osrm";
import { routeTrip, routingKey } from "../services/routing";
import { bindBreaks } from "./breaks";
import { formatClock, formatCoord, formatDuration, formatKm, formatTime } from "./format";
import { icons } from "./icons";
import { createMap } from "./map";
import { bindLayers } from "./layers";
import { createMeasure } from "./measure";
import { closeMenu, openMenu, type MenuItem } from "./menu";
import { placeCard } from "./place";
import { kindOf as kindOfStop, renderTrip, titleOf as titleOfStop, type TripStop } from "./trip";
import { bindSettings, type TripSettings } from "./settings";
import { departureCandidates, rankDepartures, type ScoredDeparture } from "../core/advice/departure";
import { DEPARTURE } from "../config/departure";
import { bindSheet } from "./sheet";
import { renderBest as renderBestList } from "./best";
import { bindShare } from "./share";
import { renderRouteList as renderRouteOptions, renderSummary as renderSummaryInto } from "./summary";

interface BreakPoint {
  pos: LatLon; // where the user put it; shown snapped to the selected route
  durationMin: number;
  auto: boolean; // made by the automatic rule and not edited since
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function startApp() {
  const stops: TripStop[] = [
    { label: "", pos: null },
    { label: "", pos: null },
  ];
  let routes: Route[] = [];
  let lines: Line[] = []; // geometry of each route, for snapping
  let breaks: BreakPoint[] = []; // ordered along the selected route
  let routedTitles: string[] = []; // titles of the stops the current routes pass through
  let selected = 0;
  let routeSeq = 0;

  const stopsEl = $("stops");
  const routesEl = $("routes");
  const statusEl = $("status");
  const summaryEl = $("summary");
  const weatherEl = $("weather");
  const warningsEl = $("warnings");
  const clothingEl = $("clothing");
  let breakRows: BreakRow[] = [];
  let routeScores: (RouteScore | null)[] = []; // per route, filled when their forecasts arrive
  let lastTimelines: Timeline[] | null = null;
  let plannedTimelines: Timeline[] | null = null; // before the live re-anchoring
  let pendingSelected = 0; // route index from a shared link, applied when the routes arrive
  let freshWeather = false; // next forecast request skips the cache (live refresh)
  let weatherSeq = 0;
  let weatherTimer: number | undefined;
  let weatherPoints: WeatherPoint[] = [];
  const sheet = bindSheet();
  let routeLabels: LatLon[] = []; // duration bubble position per route
  const map = createMap($("map"), {
    onClick: (pos) => (measure.isActive() ? measure.add(pos) : openPlace(pos)),
    onContext: openContext,
    onMoveStart: closeMenu,
    onLocate: locate,
    onRouteDrag,
  });
  const measure = createMeasure(map.leaflet, $("measure"));
  bindLayers(map.leaflet, $("layers"), $("layers-panel"));
  let gpxRoute: Route | null = null; // an imported GPX track used as the route until the stops change
  let routedKey = ""; // vehicle profile and avoid options the current routes were made with
  // Vehicle or avoid options can change the route itself; everything else only re-plans on it.
  const settingsCtl = bindSettings(() => {
    const r = settingsCtl.routing();
    if (routingKey(r.vehicle, r.avoid) !== routedKey) updateRoute();
    else renderRoutes();
  });
  const readSettings = settingsCtl.read;
  const bestEl = $("depart-best");
  const renderBreakList = bindBreaks({
    onDuration(i, min) {
      breaks[i] = { ...breaks[i], durationMin: min, auto: false };
      renderRoutes();
    },
    onRemove(i) {
      breaks.splice(i, 1);
      renderRoutes();
    },
    onAuto: addAutoBreaks,
  });

  const kindOf = (i: number) => kindOfStop(i, stops.length);
  const titleOf = (i: number) => titleOfStop(i, stops.length);

  function status(text: string, kind: "info" | "error" | "loading" = "info") {
    statusEl.textContent = text;
    statusEl.dataset.kind = kind;
  }

  function renderStops() {
    renderTrip(stopsEl, $<HTMLButtonElement>("swap"), stops, {
      onPick: (i, p) => setStop(i, p.label, p.pos),
      onRemove(i) {
        stops.splice(i, 1);
        stopsChanged();
      },
      onMove(from, to) {
        stops.splice(to, 0, ...stops.splice(from, 1));
        stopsChanged();
      },
      onSwap() {
        stops.reverse();
        stopsChanged();
      },
      near: map.center,
    });
    map.setStops(
      stops.flatMap((s, i) => (s.pos ? [{ pos: s.pos, kind: kindOf(i), index: i, title: titleOf(i) }] : [])),
      (i, pos) => placeStop(i, pos),
    );
  }

  // ---------- map click, place card and context menu ----------

  // Puts a stop at a map point with its coordinates as label until the address arrives.
  function placeStop(i: number, pos: LatLon) {
    const target = { label: formatCoord(pos), pos };
    stops[i] = target;
    stopsChanged();
    labelLater(target);
  }

  // "Durak ekle": the first empty stop, else a new via stop before the end.
  function addStopAt(pos: LatLon) {
    let i = stops.findIndex((s) => !s.pos);
    if (i < 0) {
      i = stops.length - 1;
      stops.splice(i, 0, { label: "", pos: null });
    }
    placeStop(i, pos);
  }

  const tripActions = (pos: LatLon, done: () => void) => [
    { label: "Buradan", run: () => (done(), placeStop(0, pos)) },
    { label: "Buraya", primary: true, run: () => (done(), placeStop(stops.length - 1, pos)) },
    { label: "Durak ekle", run: () => (done(), addStopAt(pos)) },
  ];

  function openPlace(pos: LatLon) {
    closeMenu();
    map.openPlace(pos, placeCard(pos, tripActions(pos, map.closePopup)));
  }

  function openContext(pos: LatLon, x: number, y: number) {
    map.closePopup();
    const coord = formatCoord(pos);
    const items: MenuItem[] = [
      { label: coord, hint: "Kopyala", action: () => void navigator.clipboard?.writeText(coord).then(() => status("Koordinat kopyalandı."), () => status(coord)) },
      { label: "Buradan yol tarifi", action: () => placeStop(0, pos) },
      { label: "Buraya yol tarifi", action: () => placeStop(stops.length - 1, pos) },
      { label: "Durak ekle", action: () => addStopAt(pos) },
    ];
    if (routes.length) items.push({ label: "Buraya mola ekle", hint: "rotada", action: () => addBreakAt(snapToLine(lines[selected], pos).pos) });
    items.push({ label: "Burada ne var?", action: () => openPlace(pos) }, { label: "Mesafe ölç", action: () => measure.start(pos) });
    openMenu(x, y, items, "Harita menüsü");
  }

  function selectRoute(i: number) {
    selected = i;
    resnapBreaks();
    renderRoutes();
  }

  // Clicking the selected route adds a break there; clicking an alternative selects it.
  function onRouteClick(i: number, p: LatLon) {
    if (measure.isActive()) return measure.add(p);
    if (i !== selected) return selectRoute(i);
    breaks.push({ pos: p, durationMin: DEFAULT_BREAK_MIN, auto: false });
    resnapBreaks();
    renderRoutes();
  }

  // A route line dragged to `drop` (Google Maps style): a via stop there, placed before the first
  // stop that lies further along that route than the grabbed point.
  function onRouteDrag(i: number, grab: LatLon, drop: LatLon) {
    if (measure.isActive()) return;
    const line = lines[i];
    const at = snapToLine(line, grab).distM;
    const filled = stops.flatMap((s, k) => (s.pos ? [{ pos: s.pos, k }] : []));
    const next = filled.slice(1).find((x) => snapToLine(line, x.pos).distM > at) ?? filled[filled.length - 1];
    const via = { label: formatCoord(drop), pos: drop };
    stops.splice(next.k, 0, via);
    stopsChanged();
    labelLater(via);
  }

  function moveBreak(i: number, p: LatLon) {
    breaks[i] = { ...breaks[i], pos: p, auto: false };
    resnapBreaks();
    renderRoutes();
  }

  // OSRM step distances and the drawn geometry differ slightly; this maps line meters to step meters.
  const scaleOf = (i: number) => {
    const len = lineLength(lines[i]);
    return len > 0 ? routes[i].distanceM / len : 1;
  };

  const breaksOn = (i: number): Break[] =>
    breaks.map((b) => ({ distM: snapToLine(lines[i], b.pos).distM * scaleOf(i), durationS: b.durationMin * 60 }));

  // Orders breaks along the selected route. Positions are kept, so switching back to
  // another route shows them where they were.
  function resnapBreaks() {
    const line = lines[selected];
    if (!line) return;
    breaks = breaks
      .map((b) => ({ b, d: snapToLine(line, b.pos).distM }))
      .sort((x, y) => x.d - y.d)
      .map((x) => x.b);
  }

  // Sample points of a route: fixed by the route itself, not by speed or departure.
  function samplesOf(i: number) {
    const route = routes[i];
    const scale = scaleOf(i);
    return sampleDistances(route.distanceM, route.durationS, WEATHER_SAMPLE.intervalMin, WEATHER_SAMPLE.maxPoints).map((d) => ({
      distM: d,
      pos: pointAtDistance(lines[i], d / scale),
    }));
  }

  // Risk at each sample point for one timeline (one departure time).
  function assess(i: number, tl: Timeline, vehicle: VehicleType, samples: { distM: number; pos: LatLon }[], forecasts: Forecast[]): WeatherPoint[] {
    const line = lines[i];
    const scale = scaleOf(i);
    return samples.map((s, k): WeatherPoint => {
      const etaMs = etaAtDistance(tl, s.distM);
      const f = forecasts[k] ?? { hours: [], sun: [] };
      const idx = nearestHourIndex(f.hours, etaMs, WEATHER_REQUEST.maxHourGapMin);
      if (idx < 0) return { ...s, etaMs, hour: null, risk: null };
      const risk = assessPoint(
        { hours: f.hours, i: idx, etaMs, rideKmh: speedAtDistance(tl, s.distM), headingDeg: bearingAt(line, s.distM / scale), sun: f.sun, pos: s.pos },
        RISK[vehicle],
        WET_ROAD,
        GLARE,
      );
      return { ...s, etaMs, hour: f.hours[idx], risk };
    });
  }

  // Riding speed at each point weights it by the time spent there (see routeScore).
  const scoreOf = (i: number, tl: Timeline, points: WeatherPoint[]) =>
    routeScore(
      points.map((p) => ({ distM: p.distM, level: p.risk ? p.risk.level : null, kmh: speedAtDistance(tl, p.distM) })),
      routes[i].distanceM,
      RISK_WEIGHTS,
    );

  // Forecast and risk for one route. The request is keyed by rounded coordinates and a minimum
  // forecast length, so ETA-only changes and departure candidates are served from the cache.
  async function pointsFor(i: number, tl: Timeline, vehicle: VehicleType, untilMs = 0) {
    const samples = samplesOf(i);
    const lastEta = etaAtDistance(tl, routes[i].distanceM);
    const forecasts = await fetchForecast(
      samples.map((p) => p.pos),
      Math.max(lastEta, untilMs),
      freshWeather,
    );
    return { samples, forecasts, points: assess(i, tl, vehicle, samples, forecasts) };
  }

  // Scores the selected route for every departure candidate in the next hours, from one forecast.
  function rankBest(settings: TripSettings, samples: { distM: number; pos: LatLon }[], forecasts: Forecast[]): ScoredDeparture[] {
    const all = departureCandidates(Date.now(), DEPARTURE.windowH, DEPARTURE.stepH).map((departMs) => {
      const tl = buildTimeline(routes[selected].steps, departMs, settings.speed, breaksOn(selected));
      return { departMs, arrivalMs: tl.timeMs[tl.timeMs.length - 1], score: scoreOf(selected, tl, assess(selected, tl, settings.vehicle, samples, forecasts)) };
    });
    return rankDepartures(all, DEPARTURE.count, DEPARTURE.maxMissing, DEPARTURE.minGapH);
  }

  const renderBest = (state: { top: ScoredDeparture[]; loading: boolean; error?: string }) =>
    renderBestList(bestEl, state, settingsCtl.best(), (ms) => {
      settingsCtl.setBest(ms);
      renderRoutes();
    });

  function updateWeather(timelines: Timeline[] | null, settings: TripSettings | null) {
    const vehicle = settings?.vehicle ?? "motorcycle";
    const bestMode = settings?.departMode === "best";
    clearTimeout(weatherTimer);
    const my = ++weatherSeq;
    const route = routes[selected];
    const tl = timelines?.[selected];
    if (!route || !tl || !timelines) {
      weatherPoints = [];
      routeScores = [];
      map.setWeather([]);
      map.setRisk([], []);
      renderWarnings(warningsEl, [], false, () => {});
      clothingEl.replaceChildren();
      if (bestMode) renderBest({ top: [], loading: false });
      return renderStrip(weatherEl, { points: [], loading: false, onRetry: () => {}, onOpen: () => {} });
    }
    const sampleCount = sampleDistances(route.distanceM, route.durationS, WEATHER_SAMPLE.intervalMin, WEATHER_SAMPLE.maxPoints).length;
    if (bestMode && !bestEl.querySelector(".best-list")) renderBest({ top: [], loading: true });
    const openPoint = (i: number) => {
      sheet.collapse();
      map.openWeather(i);
    };
    const show = (points: WeatherPoint[], loading: boolean, error?: string, extra?: { samples: { distM: number }[]; forecasts: Forecast[] }) => {
      weatherPoints = points;
      map.setWeather(points.map((p) => ({ pos: p.pos, pin: pinHtml(p), card: cardHtml(p) })));
      if (!loading) {
        paintRisk(points, route.distanceM, scaleOf(selected), lines[selected]);
        const advices = extra ? adviseBreaks(tl, extra.samples, extra.forecasts) : [];
        renderBreakList(breakRows.map((r, i) => ({ ...r, advice: advices[i] })));
        const warnings = collectWarnings(points);
        advices.forEach((a, i) => {
          const b = tl.breaks[i];
          if (a) warnings.push({ level: 2, text: `Mola ${i + 1}: ${a}`, when: `${formatClock(b.startMs)}–${formatClock(b.endMs)}`, where: `km ${Math.round(b.distM / 1000)}` });
        });
        renderWarnings(warningsEl, warnings, !error && points.length > 0, openPoint);
        renderClothing(clothingEl, error ? [] : points, vehicle);
        if (!error) live.onWeather(points);
        stopsPanel.render();
      }
      renderStrip(weatherEl, { points, loading, error, onRetry: () => updateWeather(timelines, settings), onOpen: openPoint });
    };
    // Keep the old capsules (dimmed) while the next forecast loads.
    show(weatherPoints.length === sampleCount ? weatherPoints : [], true);
    weatherTimer = window.setTimeout(async () => {
      try {
        // In best mode the forecast must also reach the arrival of the last candidate.
        const tripMs = tl.timeMs[tl.timeMs.length - 1] - tl.timeMs[0];
        const until = bestMode ? Date.now() + DEPARTURE.windowH * 3_600_000 + tripMs : 0;
        const main = await pointsFor(selected, tl, vehicle, until);
        freshWeather = false;
        if (my !== weatherSeq) return;
        if (bestMode && settings) {
          const top = rankBest(settings, main.samples, main.forecasts);
          // First time in best mode: take the top candidate and redo everything for it.
          if (settingsCtl.best() === null && top.length) {
            settingsCtl.setBest(top[0].departMs);
            return renderRoutes();
          }
          renderBest({ top, loading: false });
        }
        show(main.points, false, undefined, main);
        // Score every route for the safest-route comparison; the selected one is already done.
        const all = await Promise.all(
          routes.map((_, i) => (i === selected ? Promise.resolve(main.points) : pointsFor(i, timelines[i], vehicle).then((r) => r.points, () => null))),
        );
        if (my !== weatherSeq) return;
        routeScores = all.map((pts, i) => (pts ? scoreOf(i, timelines[i], pts) : null));
        renderRouteList(timelines);
      } catch (e) {
        if (my !== weatherSeq) return;
        // While riding, a failed refresh (no signal) keeps the last forecast on screen.
        show(live.isActive() ? weatherPoints : [], false, (e as Error).message);
        if (bestMode) renderBest({ top: [], loading: false, error: (e as Error).message });
      }
    }, 300);
  }

  // Each sample point colours the route halfway to its neighbours; runs of the same level merge.
  function paintRisk(points: WeatherPoint[], totalM: number, scale: number, line: Line) {
    const segs = points.map((p, k) => ({
      from: k === 0 ? 0 : (points[k - 1].distM + p.distM) / 2,
      to: k === points.length - 1 ? totalM : (p.distM + points[k + 1].distM) / 2,
      level: (p.risk?.level ?? 0) as Level,
      dark: p.risk?.dark ?? false,
    }));
    const runs = (key: (s: (typeof segs)[number]) => number) => {
      const out: { from: number; to: number; v: number }[] = [];
      for (const s of segs) {
        const v = key(s);
        const last = out[out.length - 1];
        if (last && last.v === v) last.to = s.to;
        else out.push({ from: s.from, to: s.to, v });
      }
      return out;
    };
    const cut = (r: { from: number; to: number }) => sliceLine(line, r.from / scale, r.to / scale);
    map.setRisk(
      runs((s) => s.level).map((r) => ({ coords: cut(r), level: r.v })),
      runs((s) => Number(s.dark))
        .filter((r) => r.v === 1)
        .map(cut),
    );
  }

  // Rain during each break, read from the sample point nearest to it.
  function adviseBreaks(tl: Timeline, samples: { distM: number }[], forecasts: Forecast[]): (string | undefined)[] {
    return tl.breaks.map((b) => {
      let k = 0;
      samples.forEach((s, j) => {
        if (Math.abs(s.distM - b.distM) < Math.abs(samples[k].distM - b.distM)) k = j;
      });
      const a = breakAdvice(forecasts[k]?.hours ?? [], b.startMs, b.endMs, BREAK_ADVICE.rainMm, BREAK_ADVICE.maxExtendMin);
      const minutes = Math.round((b.endMs - b.startMs) / 60_000);
      if (a?.kind === "rainStarts")
        return a.atMin === 0
          ? "Mola başlarken yağmur başlıyor."
          : `Yağmur molanın ${a.atMin}. dakikasında başlıyor. Molayı ${a.atMin} dk'ya kısaltırsan yağmurdan önce yola çıkarsın.`;
      if (a?.kind === "rainStops") return `Molanın sonunda yağmur var, ${a.extendMin} dk sonra diniyor. Molayı ${minutes + a.extendMin} dk'ya uzatmayı düşün.`;
      return undefined;
    });
  }

  function addBreakAt(pos: LatLon) {
    breaks.push({ pos, durationMin: DEFAULT_BREAK_MIN, auto: false });
    resnapBreaks();
    renderRoutes();
  }

  const stopsPanel = createStopsPanel({
    map,
    route: () =>
      routes[selected]
        ? { route: routes[selected], line: lines[selected], scale: scaleOf(selected), timeline: lastTimelines?.[selected] ?? null, points: weatherPoints }
        : null,
    onAdd: addBreakAt,
    onOpen: () => sheet.collapse(),
  });

  function addAutoBreaks(rule: AutoBreakRule, durationMin: number) {
    if (!routes.length) return status("Önce bir rota oluşturun.", "error");
    const settings = readSettings();
    if (typeof settings === "string") return status(settings, "error");
    // Positions come from riding time only, so existing breaks do not shift them.
    const ride = buildTimeline(routes[selected].steps, settings.departMs, settings.speed);
    const dists = autoBreakDistances(ride, rule);
    const scale = scaleOf(selected);
    breaks = breaks
      .filter((b) => !b.auto)
      .concat(dists.map((d) => ({ pos: pointAtDistance(lines[selected], d / scale), durationMin, auto: true })));
    resnapBreaks();
    renderRoutes();
    status(dists.length ? "" : "Bu aralıkla rota üzerinde mola noktası çıkmadı.");
  }

  function renderRoutes() {
    map.setBreaks(
      routes.length ? breaks.map((b) => snapToLine(lines[selected], b.pos).pos) : [],
      (p) => snapToLine(lines[selected], p).pos,
      moveBreak,
    );
    const settings = readSettings();
    const planned =
      typeof settings === "string" ? null : routes.map((r, i) => buildTimeline(r.steps, settings.departMs, settings.speed, breaksOn(i)));
    plannedTimelines = planned;
    // While riding, everything shown for the selected route counts from the rider's position and pace.
    const timelines = planned && live.isActive() ? planned.map((t, i) => (i === selected ? live.adjust(t) : t)) : planned;
    const tl = timelines?.[selected];
    lastTimelines = timelines;
    map.setRoutes(
      routes.map((r) => r.coords),
      selected,
      onRouteClick,
      timelines ? routes.map((_, i) => ({ pos: routeLabels[i], text: formatDuration(totalS(timelines[i])) })) : [],
    );
    breakRows = routes.length
      ? breaks.map((b, i) => {
          const at = tl?.breaks[i];
          return { auto: b.auto, durationMin: b.durationMin, distM: at?.distM, startMs: at?.startMs, endMs: at?.endMs };
        })
      : [];
    renderBreakList(breakRows);
    renderRouteList(timelines);
    stopsPanel.render();
    share.sync();
    share.renderRecent();
    updateWeather(timelines, typeof settings === "string" ? null : settings);
    if (typeof settings === "string") return renderSummary(null, [], settings);
    const t = timelines?.[selected];
    if (!t) return renderSummary(null, []);
    const rows: [string, string][] = [
      ...(t.breaks.length
        ? [["Molalar", `${t.breaks.length} mola · ${formatDuration(t.breaks.reduce((s, b) => s + b.endMs - b.startMs, 0) / 1000)}`] as [string, string]]
        : []),
      ["Çıkış", formatTime(t.timeMs[0])],
      ...t.legArrivalMs.map((ms, i): [string, string] => [`${routedTitles[i + 1]} varış`, formatTime(ms)]),
    ];
    if (settings.speed.mode === "road") {
      const b = roadBreakdown(routes[selected].steps, ROAD_TYPE_RULES);
      const parts: [string, number][] = [
        ["Otoyol", b.motorway],
        ["Ana yol", b.primary],
        ["Şehir içi", b.urban],
        ["Feribot", b.ferry],
      ];
      const text = parts.filter(([, m]) => m > 0).map(([n, m]) => `${n} ${formatKm(m)}`);
      rows.push(["Yol tipi (tahmin)", text.join(" · ")]);
    }
    renderSummary({ arrivalMs: t.timeMs[t.timeMs.length - 1], totalS: totalS(t), distanceM: routes[selected].distanceM }, rows);
  }

  const renderRouteList = (timelines: Timeline[] | null) => renderRouteOptions(routesEl, routes, timelines, routeScores, selected, selectRoute);
  const renderSummary = (eta: Parameters<typeof renderSummaryInto>[1], rows: [string, string][], error?: string) =>
    renderSummaryInto(summaryEl, eta, rows, error);

  // ---------- share link and recent routes ----------

  const shortLabel = (l: string) => l.split(",").slice(0, 2).join(",").trim().slice(0, SHARE.maxLabel);

  // The trip as it is set now, or null while the start or end is missing or a setting is invalid.
  function currentState(): TripState | null {
    const settings = readSettings();
    const filled = stops.filter((s) => s.pos);
    if (typeof settings === "string" || filled.length < 2) return null;
    const sp = settings.speed;
    return {
      stops: filled.map((s) => ({ label: shortLabel(s.label), lat: s.pos!.lat, lon: s.pos!.lon })),
      breaks: breaks.map((b) => ({ lat: b.pos.lat, lon: b.pos.lon, min: b.durationMin, auto: b.auto })),
      vehicle: settings.vehicle,
      speed: sp.mode === "average" ? { mode: "average", kmh: sp.kmh } : { mode: "road", ...sp.kmh },
      depart: settings.departMode === "at" ? { mode: "at", ms: settings.departMs } : { mode: settings.departMode },
      avoid: settings.avoid,
      selected,
    };
  }

  function applyState(s: TripState) {
    stops.splice(0, stops.length, ...s.stops.map((x) => ({ label: x.label, pos: { lat: x.lat, lon: x.lon } })));
    breaks = s.breaks.map((b) => ({ pos: { lat: b.lat, lon: b.lon }, durationMin: b.min, auto: b.auto }));
    settingsCtl.apply(s);
    pendingSelected = s.selected;
    routeScores = [];
    stopsPanel.reset();
    stopsChanged();
  }

  const share = bindShare({
    current: currentState,
    hasRoute: () => routes.length > 0,
    apply: applyState,
    error: (text) => status(text, "error"),
  });

  const live = createLive({
    route() {
      const r = routes[selected];
      const t = plannedTimelines?.[selected];
      if (!r || !t) return null;
      return { id: r, line: lines[selected], scale: scaleOf(selected), totalM: r.distanceM, timeline: t, points: weatherPoints };
    },
    replan: () => renderRoutes(),
    refreshWeather() {
      freshWeather = true;
      renderRoutes();
    },
    // Off route: plan again from here to the stops and breaks still ahead.
    reroute(from, aheadOfM) {
      const scale = scaleOf(selected);
      const ahead = (p: LatLon) => snapToLine(lines[selected], p).distM * scale > aheadOfM;
      const end = stops[stops.length - 1];
      const vias = stops.slice(1, -1).filter((s) => s.pos && ahead(s.pos));
      stops.splice(0, stops.length, { label: "Konumum", pos: from }, ...vias, end);
      breaks = breaks.filter((b) => ahead(b.pos));
      stopsChanged();
    },
    showPosition: (p) => map.setLivePosition(p, $("live").hidden === true),
  });
  $("live-start").addEventListener("click", () => {
    sheet.collapse();
    live.start();
  });

  function stopsChanged() {
    gpxRoute = null;
    renderStops();
    updateRoute();
  }

  function setStop(i: number, label: string, pos: LatLon) {
    stops[i] = { label, pos };
    stopsChanged();
  }

  async function labelLater(stop: TripStop) {
    if (!stop.pos) return;
    const label = await reverseLabel(stop.pos);
    // Skip if the stop was replaced or removed meanwhile.
    if (label && stops.includes(stop)) {
      stop.label = label;
      renderStops();
    }
  }

  async function updateRoute() {
    const my = ++routeSeq;
    // Empty rows are skipped, like a map app does while a new stop is being typed.
    const filled = stops.flatMap((s) => (s.pos ? [s.pos] : []));
    if (filled.length < 2) {
      routes = [];
      renderRoutes();
      status(filled.length ? "Rota için başlangıç ve bitiş seçin." : "");
      return;
    }
    status("Rota hesaplanıyor…", "loading");
    const routed = filled.map((pos, k) => ({ pos, title: titleOfStop(k, filled.length) }));
    const how = settingsCtl.routing();
    routedKey = routingKey(how.vehicle, how.avoid);
    try {
      const result = gpxRoute
        ? [gpxRoute]
        : await routeTrip(
            routed.map((s) => s.pos),
            how.vehicle,
            how.avoid,
          );
      if (my !== routeSeq) return;
      routes = result;
      lines = result.map((r) => makeLine(r.coords));
      routeLabels = lines.map((l, i) => labelPoint(l, lines.filter((_, j) => j !== i)));
      routeScores = []; // scores belong to the old routes
      routedTitles = routed.map((s) => s.title);
      selected = pendingSelected < result.length ? pendingSelected : 0;
      pendingSelected = 0;
      resnapBreaks();
      share.saveRecent();
      renderRoutes();
      map.fit(result.flatMap((r) => r.coords), sheet.insets());
      status("");
    } catch (e) {
      if (my !== routeSeq) return;
      routes = [];
      renderRoutes();
      status((e as Error).message, "error");
    }
  }

  $("add-via").insertAdjacentHTML("afterbegin", icons.plus);

  $("add-via").addEventListener("click", () => {
    stops.push({ label: "", pos: null });
    renderStops();
    stopsEl.querySelectorAll("input")[stops.length - 1]?.focus();
  });
  $("swap").innerHTML = icons.swap;
  $("swap").addEventListener("click", () => {
    stops.reverse();
    stopsChanged();
  });

  // "Konumumu göster": centre on the device and show a dot (tap it for the place card).
  // With no start yet, the position also becomes the start, as before.
  function locate() {
    if (!navigator.geolocation) return status("Tarayıcınız konum özelliğini desteklemiyor.", "error");
    status("Konum alınıyor…", "loading");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lon: p.coords.longitude };
        status("");
        map.showMe(pos, () => openPlace(pos));
        if (!stops[0].pos) setStop(0, "Konumum", pos);
      },
      (err) => status(err.code === err.PERMISSION_DENIED ? "Konum izni reddedildi." : "Konum alınamadı.", "error"),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  // ---------- GPX ----------

  // The track becomes the route itself (no routing server); stops are its two ends.
  $<HTMLInputElement>("gpx-file").addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const gpx = parseGpx(await file.text());
    if (!gpx) return status("GPX dosyasında en az iki iz veya rota noktası bulunamadı.", "error");
    const distanceM = lineLength(makeLine(gpx.points));
    const durationS = distanceM / (GPX_TRACK_KMH / 3.6);
    gpxRoute = { coords: gpx.points, distanceM, durationS, steps: [{ distanceM, durationS, ref: "", ferry: false, leg: 0 }] };
    const first = gpx.points[0];
    const last = gpx.points[gpx.points.length - 1];
    const ends = [first, last].map((pos) => ({ label: formatCoord(pos), pos }));
    stops.splice(0, stops.length, ...ends);
    breaks = [];
    renderStops();
    ends.forEach(labelLater);
    await updateRoute();
    status(`GPX rotası${gpx.name ? ` "${gpx.name}"` : ""}: ${formatKm(distanceM)}, ${gpx.points.length} nokta. Paylaşım linki sadece başlangıç ve bitişi taşır.`);
  });
  $("gpx-import").addEventListener("click", () => $("gpx-file").click());

  $("gpx-export").addEventListener("click", () => {
    const route = routes[selected];
    if (!route) return;
    const tl = lastTimelines?.[selected];
    const named = stops.flatMap((s, i) => (s.pos ? [{ pos: s.pos, name: `${titleOf(i)}: ${s.label.split(",")[0]}` }] : []));
    const breakPts = breaks.map((b, i) => {
      const at = tl?.breaks[i];
      return { pos: snapToLine(lines[selected], b.pos).pos, name: `Mola ${i + 1} · ${b.durationMin} dk${at ? " · " + formatClock(at.startMs) : ""}` };
    });
    const first = stops.find((s) => s.pos)?.label.split(",")[0] ?? "Başlangıç";
    const last = [...stops].reverse().find((s) => s.pos)?.label.split(",")[0] ?? "Bitiş";
    const xml = toGpx(`${first} → ${last}`, route.coords, [...named, ...breakPts]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([xml], { type: "application/gpx+xml" }));
    a.download = `ridecast-${slug(first)}-${slug(last)}.gpx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // Offline: say so; the service worker serves the last routes and forecasts it saw.
  const offlineText = "Çevrimdışısın; son alınan rota ve hava verisi gösteriliyor.";
  const netChanged = () => {
    if (!navigator.onLine) status(offlineText);
    else if (statusEl.textContent === offlineText) status("");
    // Back online while riding: fetch a fresh forecast right away.
    if (navigator.onLine && live.isActive()) {
      freshWeather = true;
      renderRoutes();
    }
    live.render();
  };
  addEventListener("online", netChanged);
  addEventListener("offline", netChanged);

  // Shortcuts: Escape closes the menu, card and measuring; "/" jumps to the next address field.
  addEventListener("keydown", (e) => {
    const typing = (e.target as Element).closest?.("input, select, textarea");
    if (e.key === "Escape") {
      closeMenu();
      map.closePopup();
      if (measure.isActive()) measure.stop();
    } else if (e.key === "/" && !typing) {
      e.preventDefault();
      const inputs = [...stopsEl.querySelectorAll("input")];
      (inputs.find((x) => !x.value) ?? inputs[inputs.length - 1])?.focus();
    }
  });

  renderStops();
  if (!share.applyHash()) share.renderRecent();
}

// File-name safe ASCII: Turkish letters folded, other characters dropped.
const slug = (s: string) =>
  s
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (ch) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[ch]!)
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "rota";
