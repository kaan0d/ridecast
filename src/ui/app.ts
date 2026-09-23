import { DEFAULT_BREAK_MIN } from "../config/breaks";
import { WEATHER_REQUEST, WEATHER_SAMPLE } from "../config/weather";
import { ROAD_TYPE_RULES } from "../config/vehicles";
import { autoBreakDistances, buildTimeline, etaAtDistance, speedAtDistance, type AutoBreakRule, type Break, type Timeline } from "../core/eta/eta";
import { assessPoint, breakAdvice, type Level } from "../core/risk/risk";
import { BREAK_ADVICE, RISK, RISK_WEIGHTS, SAFEST_MIN_DROP, WET_ROAD } from "../config/risk";
import { chooseSafest, routeScore, type RouteScore } from "../core/risk/route";
import type { VehicleType } from "../config/vehicles";
import { type LatLon } from "../core/geo";
import { bearingAt, lineLength, makeLine, pointAtDistance, sliceLine, snapToLine, type Line } from "../core/route/line";
import { roadBreakdown } from "../core/route/roadType";
import { nearestHourIndex, sampleDistances, type Forecast } from "../core/weather/weather";
import { fetchForecast } from "../services/openmeteo";
import { cardHtml, collectWarnings, LEVEL_LABEL, pinHtml, renderStrip, renderWarnings, type WeatherPoint } from "./weather";
import type { BreakRow } from "./breaks";
import { renderClothing } from "./advice";
import { decodeState, encodeState, type TripState } from "../core/share/state";
import { addRecent, parseRecent, type RecentRoute } from "../core/share/recent";
import { SHARE } from "../config/share";
import { SPEED_LIMITS_KMH } from "../config/vehicles";
import { BREAK_LIMITS_MIN } from "../config/breaks";
import { pickStops, type Poi, type StopOnRoute } from "../core/advice/stops";
import { STOPS } from "../config/stops";
import { fetchStops } from "../services/overpass";
import { renderStops as renderStopList, stopPin } from "./stops";
import { haversineM, segmentBoxes } from "../core/route/line";
import { reverseLabel } from "../services/nominatim";
import { getRoutes, type Route } from "../services/osrm";
import { bindBreaks } from "./breaks";
import { formatClock, formatCoord, formatDay, formatDuration, formatKm, formatTime } from "./format";
import { icons } from "./icons";
import { createMap, type StopKind } from "./map";
import { placeInput } from "./search";
import { bindSettings, type TripSettings } from "./settings";
import { departureCandidates, rankDepartures, type ScoredDeparture } from "../core/advice/departure";
import { DEPARTURE } from "../config/departure";
import { bindSheet } from "./sheet";

interface Stop {
  label: string;
  pos: LatLon | null;
}

interface BreakPoint {
  pos: LatLon; // where the user put it; shown snapped to the selected route
  durationMin: number;
  auto: boolean; // made by the automatic rule and not edited since
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function startApp() {
  const stops: Stop[] = [
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
  const stopsPanelEl = $("stops-panel");
  // Stops found for one route (by route geometry), loaded on request.
  let poiState: { route: Route; pois: Poi[] | null; loading: boolean; error?: string } | null = null;
  let shownStops: StopOnRoute[] = [];
  let breakRows: BreakRow[] = [];
  let routeScores: (RouteScore | null)[] = []; // per route, filled when their forecasts arrive
  let lastTimelines: Timeline[] | null = null;
  let pendingSelected = 0; // route index from a shared link, applied when the routes arrive
  let weatherSeq = 0;
  let weatherTimer: number | undefined;
  let weatherPoints: WeatherPoint[] = [];
  const sheet = bindSheet();
  const map = createMap($("map"), onMapClick);
  const settingsCtl = bindSettings(renderRoutes);
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

  const kindOf = (i: number): StopKind => (i === 0 ? "start" : i === stops.length - 1 ? "end" : "via");
  const titleOf = (i: number) => ({ start: "Başlangıç", end: "Bitiş", via: `Ara durak ${i}` })[kindOf(i)];
  const placeholderOf = (i: number) => ({ start: "Nereden?", end: "Nereye?", via: "Ara durak" })[kindOf(i)];

  function status(text: string, kind: "info" | "error" | "loading" = "info") {
    statusEl.textContent = text;
    statusEl.dataset.kind = kind;
  }

  function renderStops() {
    stopsEl.replaceChildren(
      ...stops.map((s, i) => {
        const row = document.createElement("li");
        row.className = `stop-row stop-${kindOf(i)}`;
        const glyph = document.createElement("span");
        glyph.className = "stop-glyph";
        row.append(glyph, placeInput(s.label, placeholderOf(i), `${titleOf(i)} adresi`, (p) => setStop(i, p.label, p.pos)));
        if (kindOf(i) === "via") {
          const rm = document.createElement("button");
          rm.type = "button";
          rm.className = "icon-btn";
          rm.innerHTML = icons.close;
          rm.setAttribute("aria-label", `${titleOf(i)} sil`);
          rm.addEventListener("click", () => {
            stops.splice(i, 1);
            stopsChanged();
          });
          row.append(rm);
        }
        return row;
      }),
    );
    map.setStops(stops.flatMap((s, i) => (s.pos ? [{ pos: s.pos, kind: kindOf(i) }] : [])));
  }

  function selectRoute(i: number) {
    selected = i;
    resnapBreaks();
    renderRoutes();
  }

  // Clicking the selected route adds a break there; clicking an alternative selects it.
  function onRouteClick(i: number, p: LatLon) {
    if (i !== selected) return selectRoute(i);
    breaks.push({ pos: p, durationMin: DEFAULT_BREAK_MIN, auto: false });
    resnapBreaks();
    renderRoutes();
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

  // Sample points depend only on the route; their ETAs follow the timeline. The forecast request
  // is keyed by rounded coordinates, so ETA-only changes are served from the cache.
  // Forecast and risk for one route. Sample points depend only on the route; their ETAs follow
  // the timeline, and the request is keyed by rounded coordinates, so ETA-only changes hit the cache.
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
        { hours: f.hours, i: idx, etaMs, rideKmh: speedAtDistance(tl, s.distM), headingDeg: bearingAt(line, s.distM / scale), sun: f.sun },
        RISK[vehicle],
        WET_ROAD,
      );
      return { ...s, etaMs, hour: f.hours[idx], risk };
    });
  }

  const scoreOf = (i: number, points: WeatherPoint[]) =>
    routeScore(points.map((p) => ({ distM: p.distM, level: p.risk ? p.risk.level : null })), routes[i].distanceM, RISK_WEIGHTS);

  // Forecast and risk for one route. The request is keyed by rounded coordinates and a minimum
  // forecast length, so ETA-only changes and departure candidates are served from the cache.
  async function pointsFor(i: number, tl: Timeline, vehicle: VehicleType, untilMs = 0) {
    const samples = samplesOf(i);
    const lastEta = etaAtDistance(tl, routes[i].distanceM);
    const forecasts = await fetchForecast(
      samples.map((p) => p.pos),
      Math.max(lastEta, untilMs),
    );
    return { samples, forecasts, points: assess(i, tl, vehicle, samples, forecasts) };
  }

  // Scores the selected route for every departure candidate in the next hours, from one forecast.
  function rankBest(settings: TripSettings, samples: { distM: number; pos: LatLon }[], forecasts: Forecast[]): ScoredDeparture[] {
    const all = departureCandidates(Date.now(), DEPARTURE.windowH, DEPARTURE.stepH).map((departMs) => {
      const tl = buildTimeline(routes[selected].steps, departMs, settings.speed, breaksOn(selected));
      return { departMs, arrivalMs: tl.timeMs[tl.timeMs.length - 1], score: scoreOf(selected, assess(selected, tl, settings.vehicle, samples, forecasts)) };
    });
    return rankDepartures(all, DEPARTURE.count, DEPARTURE.maxMissing);
  }

  function renderBest(state: { top: ScoredDeparture[]; loading: boolean; error?: string }) {
    if (state.error || state.loading || !state.top.length) {
      const p = document.createElement("p");
      p.className = "footnote";
      p.textContent = state.error ?? (state.loading ? "Önümüzdeki 24 saat karşılaştırılıyor…" : "Karşılaştırma için önce bir rota oluşturun.");
      return bestEl.replaceChildren(p);
    }
    const list = document.createElement("ol");
    list.className = "best-list";
    for (const d of state.top) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "best-item";
      b.setAttribute("aria-pressed", String(settingsCtl.best() === d.departMs));
      const score = d.score.score.toFixed(1).replace(".", ",");
      b.innerHTML = `<span class="best-time">${formatTime(d.departMs)}</span><span class="best-meta"><span class="risk-dot risk-${d.score.worst}" aria-hidden="true"></span>varış ${formatClock(d.arrivalMs)} · risk ${score}</span>`;
      b.addEventListener("click", () => {
        settingsCtl.setBest(d.departMs);
        renderRoutes();
      });
      li.append(b);
      list.append(li);
    }
    const note = document.createElement("p");
    note.className = "footnote";
    note.textContent = `Önümüzdeki ${DEPARTURE.windowH} saat, saat başı adaylar arasından en düşük riskli ${state.top.length} çıkış.`;
    bestEl.replaceChildren(list, note);
  }

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
        renderStopsPanel();
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
        routeScores = all.map((pts, i) => (pts ? scoreOf(i, pts) : null));
        renderRouteList(timelines);
      } catch (e) {
        if (my !== weatherSeq) return;
        show([], false, (e as Error).message);
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

  async function loadStops() {
    const route = routes[selected];
    if (!route) return;
    poiState = { route, pois: null, loading: true };
    renderStopsPanel();
    try {
      const pois = await fetchStops(segmentBoxes(lines[selected], STOPS.boxSegmentM, STOPS.boxPadDeg));
      if (poiState?.route !== route) return;
      poiState = { route, pois, loading: false };
    } catch (e) {
      if (poiState?.route !== route) return;
      poiState = { route, pois: null, loading: false, error: (e as Error).message };
    }
    renderStopsPanel();
  }

  // Stops of the selected route with km, ETA and the shelter recommendation from the weather points.
  function renderStopsPanel() {
    const route = routes[selected];
    const state = poiState && poiState.route === route ? poiState : null;
    const tl = lastTimelines?.[selected];
    const scale = route ? scaleOf(selected) : 1;
    const badAt = (d: number) => {
      if (!weatherPoints.length) return false;
      const p = weatherPoints.reduce((a, b) => (Math.abs(b.distM - d) < Math.abs(a.distM - d) ? b : a));
      const r = p.risk;
      return !!r && (r.events.some((e) => e.kind === "rain" || e.kind === "snow" || e.kind === "storm") || r.feltC <= STOPS.badFeltC);
    };
    shownStops =
      route && state?.pois
        ? pickStops(
            state.pois.flatMap((p) => {
              const s = snapToLine(lines[selected], p.pos);
              return haversineM(s.pos, p.pos) <= STOPS.corridorM ? [{ ...p, distM: s.distM * scale }] : [];
            }),
            badAt,
            STOPS.minGapM,
          )
        : [];
    const addStop = (s: StopOnRoute) => {
      breaks.push({ pos: s.pos, durationMin: DEFAULT_BREAK_MIN, auto: false });
      resnapBreaks();
      map.closePopup();
      renderRoutes();
    };
    map.setPois(
      shownStops.map((s) => ({
        pos: s.pos,
        pin: stopPin(s),
        popup: () => {
          const div = document.createElement("div");
          div.className = "poi-card";
          const name = document.createElement("strong");
          name.textContent = s.name;
          const meta = document.createElement("span");
          meta.textContent = `km ${Math.round(s.distM / 1000)}${s.recommended ? " · barınaklı, önerilir" : ""}`;
          const b = document.createElement("button");
          b.type = "button";
          b.className = "button-secondary";
          b.textContent = "Mola ekle";
          b.addEventListener("click", () => addStop(s));
          div.append(name, meta, b);
          return div;
        },
      })),
    );
    $("stops-section").hidden = !route;
    if (!route) return stopsPanelEl.replaceChildren();
    renderStopList(stopsPanelEl, {
      stops: state?.pois ? shownStops : null,
      loading: !!state?.loading,
      error: state?.error,
      etaAt: (d) => (tl ? etaAtDistance(tl, d) : null),
      onLoad: loadStops,
      onAdd: addStop,
      onOpen: (i) => {
        sheet.collapse();
        map.openPoi(i);
      },
    });
  }

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
    map.setRoutes(
      routes.map((r) => r.coords),
      selected,
      onRouteClick,
    );
    map.setBreaks(
      routes.length ? breaks.map((b) => snapToLine(lines[selected], b.pos).pos) : [],
      (p) => snapToLine(lines[selected], p).pos,
      moveBreak,
    );
    const settings = readSettings();
    const timelines =
      typeof settings === "string" ? null : routes.map((r, i) => buildTimeline(r.steps, settings.departMs, settings.speed, breaksOn(i)));
    const tl = timelines?.[selected];
    lastTimelines = timelines;
    breakRows = routes.length
      ? breaks.map((b, i) => {
          const at = tl?.breaks[i];
          return { auto: b.auto, durationMin: b.durationMin, distM: at?.distM, startMs: at?.startMs, endMs: at?.endMs };
        })
      : [];
    renderBreakList(breakRows);
    renderRouteList(timelines);
    renderStopsPanel();
    syncHash();
    renderRecent();
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

  // Route options with duration and, once forecasts are in, risk and the safest-route mark.
  function renderRouteList(timelines: Timeline[] | null) {
    const choice =
      timelines && routeScores.length === routes.length
        ? chooseSafest(
            routes.map((_, i) => ({ durationS: totalS(timelines[i]), score: routeScores[i] })),
            SAFEST_MIN_DROP,
          )
        : null;
    routesEl.replaceChildren(
      ...routes.map((r, i) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        b.className = "route-item";
        b.setAttribute("aria-pressed", String(i === selected));
        const text = document.createElement("span");
        const name = document.createElement("strong");
        name.textContent = i === 0 ? "Önerilen rota" : `Alternatif ${i}`;
        const sub = document.createElement("span");
        sub.className = "sub";
        const score = routeScores[i];
        sub.textContent = formatKm(r.distanceM);
        if (score) {
          const risk = document.createElement("span");
          risk.className = "route-risk";
          risk.innerHTML = `<span class="risk-dot risk-${score.worst}" aria-hidden="true"></span>`;
          risk.append(`risk ${score.score.toFixed(1).replace(".", ",")} · en yüksek: ${LEVEL_LABEL[score.worst].toLowerCase()}`);
          sub.append(" · ", risk);
        }
        text.append(name, sub);
        const dur = document.createElement("span");
        dur.className = "dur";
        dur.textContent = timelines ? formatDuration(totalS(timelines[i])) : "–";
        b.append(text, dur);
        if (choice && choice.safest === i) {
          const badge = document.createElement("span");
          badge.className = "safest";
          const diff =
            choice.safest === choice.base
              ? "En hızlısı da bu"
              : `${choice.extraMin >= 0 ? "+" : "−"}${Math.abs(choice.extraMin)} dk, risk %${Math.round(choice.riskDrop * 100)} daha düşük`;
          badge.innerHTML = `<b>En güvenli rota</b><span>${diff}</span>`;
          b.append(badge);
        }
        b.addEventListener("click", () => selectRoute(i));
        li.append(b);
        return li;
      }),
    );
  }

  // Big arrival time, then the details as a grouped list.
  function renderSummary(eta: { arrivalMs: number; totalS: number; distanceM: number } | null, rows: [string, string][], error?: string) {
    if (error) {
      const p = document.createElement("p");
      p.className = "eta-error";
      p.textContent = error;
      return summaryEl.replaceChildren(p);
    }
    if (!eta) return summaryEl.replaceChildren();
    const head = document.createElement("div");
    head.className = "eta";
    const time = document.createElement("strong");
    time.className = "eta-time";
    time.textContent = formatClock(eta.arrivalMs);
    const small = document.createElement("small");
    small.textContent = "varış";
    time.append(small);
    const meta = document.createElement("span");
    meta.className = "eta-meta";
    meta.textContent = `${formatDuration(eta.totalS)} · ${formatKm(eta.distanceM)} · ${formatDay(eta.arrivalMs)}`;
    head.append(time, meta);

    const dl = document.createElement("dl");
    dl.className = "group details";
    for (const [k, v] of rows) {
      const row = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      row.append(dt, dd);
      dl.append(row);
    }
    summaryEl.replaceChildren(head, dl);
  }

  // ---------- share link and recent routes ----------

  const shortLabel = (l: string) => l.split(",").slice(0, 2).join(",").trim().slice(0, SHARE.maxLabel);

  // The trip as it is set now, or null while the start or end is missing or a setting is invalid.
  function currentState(): TripState | null {
    const settings = readSettings();
    const filled = stops.filter((s) => s.pos);
    if (typeof settings === "string" || !stops[0].pos || !stops[stops.length - 1].pos) return null;
    const sp = settings.speed;
    return {
      stops: filled.map((s) => ({ label: shortLabel(s.label), lat: s.pos!.lat, lon: s.pos!.lon })),
      breaks: breaks.map((b) => ({ lat: b.pos.lat, lon: b.pos.lon, min: b.durationMin, auto: b.auto })),
      vehicle: settings.vehicle,
      speed: sp.mode === "average" ? { mode: "average", kmh: sp.kmh } : { mode: "road", ...sp.kmh },
      depart: settings.departMode === "at" ? { mode: "at", ms: settings.departMs } : { mode: settings.departMode },
      selected,
    };
  }

  // Keeps the address bar in step with the trip, so a reload or a copied URL restores it.
  function syncHash() {
    const s = currentState();
    const hash = s ? "#" + encodeState(s) : "";
    if (location.hash !== hash) history.replaceState(null, "", hash || location.pathname + location.search);
    $("share").hidden = !s || !routes.length;
  }

  function applyState(s: TripState) {
    stops.splice(0, stops.length, ...s.stops.map((x) => ({ label: x.label, pos: { lat: x.lat, lon: x.lon } })));
    breaks = s.breaks.map((b) => ({ pos: { lat: b.lat, lon: b.lon }, durationMin: b.min, auto: b.auto }));
    settingsCtl.apply(s);
    pendingSelected = s.selected;
    routeScores = [];
    poiState = null;
    stopsChanged();
  }

  function applyHash(): boolean {
    if (!location.hash) return false;
    const s = decodeState(location.hash, {
      minKmh: SPEED_LIMITS_KMH.min,
      maxKmh: SPEED_LIMITS_KMH.max,
      minBreak: BREAK_LIMITS_MIN.min,
      maxBreak: BREAK_LIMITS_MIN.max,
    });
    if (!s) {
      status("Bu link okunamadı; rota yüklenmedi.", "error");
      syncHash(); // put the current trip back in the address bar
      return false;
    }
    applyState(s);
    return true;
  }

  // Browser storage can be missing or blocked (private mode); the app works without it.
  function loadRecent(): RecentRoute[] {
    try {
      return parseRecent(localStorage.getItem(SHARE.storageKey));
    } catch {
      return [];
    }
  }

  function saveRecent() {
    const s = currentState();
    if (!s) return;
    const first = s.stops[0].label.split(",")[0] || "Başlangıç";
    const last = s.stops[s.stops.length - 1].label.split(",")[0] || "Bitiş";
    const entry: RecentRoute = {
      key: s.stops.map((x) => `${x.lat.toFixed(4)},${x.lon.toFixed(4)}`).join(";"),
      title: `${first} → ${last}`,
      hash: encodeState(s),
      savedMs: Date.now(),
    };
    try {
      localStorage.setItem(SHARE.storageKey, JSON.stringify(addRecent(loadRecent(), entry, SHARE.maxRecent)));
    } catch {
      // not saved; nothing else depends on it
    }
    renderRecent();
  }

  function renderRecent() {
    const el = $("recent");
    const list = routes.length ? [] : loadRecent();
    if (!list.length) return el.replaceChildren();
    const title = document.createElement("h2");
    title.className = "group-title";
    title.textContent = "Son rotalar";
    const ol = document.createElement("ol");
    ol.className = "group recent-list";
    for (const r of list) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "recent-item";
      const t = document.createElement("span");
      t.textContent = r.title;
      const d = document.createElement("span");
      d.className = "recent-date";
      d.textContent = formatDay(r.savedMs);
      b.append(t, d);
      b.addEventListener("click", () => {
        history.replaceState(null, "", "#" + r.hash);
        applyHash();
      });
      li.append(b);
      ol.append(li);
    }
    el.replaceChildren(title, ol);
  }

  $("copy-link").addEventListener("click", async () => {
    syncHash();
    const note = $("copy-status");
    try {
      // A clipboard request can hang (e.g. waiting on a permission prompt); fall back after a moment.
      await Promise.race([
        navigator.clipboard.writeText(location.href),
        new Promise((_, reject) => setTimeout(() => reject(new Error("clipboard timeout")), SHARE.clipboardTimeoutMs)),
      ]);
      note.textContent = "Kopyalandı";
    } catch {
      // Clipboard can be blocked; show the link selected so it can be copied by hand.
      const field = document.createElement("input");
      field.readOnly = true;
      field.className = "copy-field";
      field.value = location.href;
      field.setAttribute("aria-label", "Paylaşım linki");
      note.replaceChildren(field);
      field.select();
      return;
    }
    setTimeout(() => (note.textContent = ""), 2500);
  });

  addEventListener("hashchange", () => applyHash());

  function stopsChanged() {
    renderStops();
    updateRoute();
  }

  function setStop(i: number, label: string, pos: LatLon) {
    stops[i] = { label, pos };
    stopsChanged();
  }

  // Map click fills the first empty stop, else adds a via stop before the end.
  function onMapClick(pos: LatLon) {
    let i = stops.findIndex((s) => !s.pos);
    if (i < 0) {
      i = stops.length - 1;
      stops.splice(i, 0, { label: "", pos: null });
    }
    const target = { label: formatCoord(pos), pos };
    stops[i] = target;
    stopsChanged();
    labelLater(target);
  }

  async function labelLater(stop: Stop) {
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
    const start = stops[0].pos;
    const end = stops[stops.length - 1].pos;
    if (!start || !end) {
      routes = [];
      renderRoutes();
      status(start || end ? "Rota için başlangıç ve bitiş seçin." : "");
      return;
    }
    status("Rota hesaplanıyor…", "loading");
    const routed = stops.flatMap((s, i) => (s.pos ? [{ pos: s.pos, title: titleOf(i) }] : []));
    try {
      const result = await getRoutes(routed.map((s) => s.pos));
      if (my !== routeSeq) return;
      routes = result;
      lines = result.map((r) => makeLine(r.coords));
      routeScores = []; // scores belong to the old routes
      routedTitles = routed.map((s) => s.title);
      selected = pendingSelected < result.length ? pendingSelected : 0;
      pendingSelected = 0;
      resnapBreaks();
      saveRecent();
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
  $("locate").innerHTML = icons.locate;

  $("add-via").addEventListener("click", () => {
    stops.splice(stops.length - 1, 0, { label: "", pos: null });
    renderStops();
    stopsEl.querySelectorAll("input")[stops.length - 2]?.focus();
  });

  $("locate").addEventListener("click", () => {
    if (!navigator.geolocation) return status("Tarayıcınız konum özelliğini desteklemiyor.", "error");
    status("Konum alınıyor…", "loading");
    navigator.geolocation.getCurrentPosition(
      (p) => setStop(0, "Konumum", { lat: p.coords.latitude, lon: p.coords.longitude }),
      (err) => status(err.code === err.PERMISSION_DENIED ? "Konum izni reddedildi." : "Konum alınamadı.", "error"),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });

  renderStops();
  if (!applyHash()) renderRecent();
}

const totalS = (t: Timeline) => (t.timeMs[t.timeMs.length - 1] - t.timeMs[0]) / 1000;
