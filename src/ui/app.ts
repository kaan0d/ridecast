import { t } from "../i18n";
import { DEFAULT_BREAK_MIN, OVERNIGHT } from "../config/breaks";
import { DEPARTURE } from "../config/departure";
import { SHARE } from "../config/share";
import { autoBreakDistances, buildTimeline, etaAtDistance, resumeAtClock, totalS, type AutoBreakRule, type Break, type Timeline } from "../core/eta/eta";
import type { LatLon } from "../core/geo";
import { bestPerDay, rankDepartures, type ScoredDeparture } from "../core/advice/departure";
import { fuelGaps } from "../core/advice/stops";
import { pointRuns, type RouteScore } from "../core/risk/route";
import { labelPoint, lineLength, makeLine, pointAtDistance, sliceLine, snapToLine, type Line } from "../core/route/line";
import type { Forecast } from "../core/weather/weather";
import { encodeState, type TripState } from "../core/share/state";
import { reverseLabel } from "../services/nominatim";
import type { Route } from "../services/osrm";
import { routeTrip, routingKey } from "../services/routing";
import { renderClothing } from "./advice";
import { renderBest as renderBestList, type BestWindow } from "./best";
import { adviseBreaks, bindBreaks, type BreakRow } from "./breaks";
import { bindChanges } from "./changes";
import { createForecast } from "./forecast";
import { formatClock, formatCoord, formatDuration } from "./format";
import { bindGpx } from "./gpx";
import { icons } from "./icons";
import { bindLayers } from "./layers";
import { createLive } from "./live";
import { createMap } from "./map";
import { bindMapActions } from "./mapActions";
import { createMeasure } from "./measure";
import { closeMenu } from "./menu";
import { bindSettings, type TripSettings } from "./settings";
import { bindShare } from "./share";
import { bindSheet } from "./sheet";
import { createStopsPanel } from "./stops";
import { renderRouteList as renderRouteOptions, renderSummary as renderSummaryInto, summaryRows } from "./summary";
import { kindOf as kindOfStop, renderTrip, titleOf as titleOfStop, type TripStop } from "./trip";
import { cardHtml, collectWarnings, pinHtml, renderStrip, renderWarnings, type Warning, type WeatherPoint } from "./weather";

interface BreakPoint {
  pos: LatLon; // where the user put it; shown snapped to the selected route
  durationMin: number;
  auto: boolean; // made by the automatic rule and not edited since
  resumeMin?: number; // overnight stop: ride on at this local minute of the day
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Planner state and the wiring between panels, map and services. Rendering lives in the panel
// modules, forecast maths in forecast.ts, map interactions in mapActions.ts.
export function startApp() {
  const stops: TripStop[] = [
    { label: "", pos: null },
    { label: "", pos: null },
  ];
  let routes: Route[] = [];
  let lines: Line[] = []; // geometry of each route, for snapping
  let breaks: BreakPoint[] = []; // ordered along the selected route
  let routedTitles: string[] = []; // titles of the stops the current routes pass through
  let routeLabels: LatLon[] = []; // duration bubble position per route
  let selected = 0;
  let routeSeq = 0;
  let gpxRoute: Route | null = null; // an imported GPX track used as the route until the stops change
  let routedKey = ""; // vehicle profile and avoid options the current routes were made with

  let breakRows: BreakRow[] = [];
  let routeScores: (RouteScore | null)[] = []; // per route, filled when their forecasts arrive
  let lastTimelines: Timeline[] | null = null;
  let plannedTimelines: Timeline[] | null = null; // before the live re-anchoring
  let pendingSelected = 0; // route index from a shared link, applied when the routes arrive
  let freshWeather = false; // next forecast request skips the cache (live refresh)
  let weatherSeq = 0;
  let weatherTimer: number | undefined;
  let weatherPoints: WeatherPoint[] = [];
  let bestWindow: BestWindow = "day"; // "Best time" over the next 24 hours or the next 7 days

  const stopsEl = $("stops");
  const statusEl = $("status");
  const bestEl = $("depart-best");

  const status = (text: string, kind: "info" | "error" | "loading" = "info") => {
    statusEl.textContent = text;
    statusEl.dataset.kind = kind;
  };
  const kindOf = (i: number) => kindOfStop(i, stops.length);
  const titleOf = (i: number) => titleOfStop(i, stops.length);

  // OSRM step distances and the drawn geometry differ slightly; this maps line meters to step meters.
  const scaleOf = (i: number) => {
    const len = lineLength(lines[i]);
    return len > 0 ? routes[i].distanceM / len : 1;
  };

  const breaksOn = (i: number): Break[] =>
    breaks.map((b) => ({
      distM: snapToLine(lines[i], b.pos).distM * scaleOf(i),
      durationS: b.durationMin * 60,
      // Overnight: the browser's local clock decides when the next morning is.
      ...(b.resumeMin !== undefined && {
        resumeAt: (ms: number) => resumeAtClock(ms, b.resumeMin!, OVERNIGHT.minStayH * 3_600_000, -new Date(ms).getTimezoneOffset()),
      }),
    }));

  const forecast = createForecast({
    view: (i) => ({ route: routes[i], line: lines[i], scale: scaleOf(i) }),
    breaks: breaksOn,
    fresh: () => freshWeather,
  });

  // ---------- panels and map ----------

  const sheet = bindSheet();
  const map = createMap($("map"), {
    onClick: (pos) => actions.onClick(pos),
    onContext: (pos, x, y) => actions.onContext(pos, x, y),
    onMoveStart: closeMenu,
    onLocate: () => actions.locate(),
    onRouteDrag,
  });
  const measure = createMeasure(map.leaflet, $("measure"));
  bindLayers(map.leaflet, $("layers"), $("layers-panel"));
  const actions = bindMapActions({
    map,
    measure,
    status,
    setStart: (pos, label) => (label ? setStop(0, label, pos) : placeStop(0, pos)),
    setEnd: (pos) => placeStop(stops.length - 1, pos),
    addStop: addStopAt,
    canAddBreak: () => routes.length > 0,
    addBreak: (pos) => addBreakAt(snapToLine(lines[selected], pos).pos),
    hasStart: () => !!stops[0].pos,
    focusNextAddress() {
      const inputs = [...stopsEl.querySelectorAll("input")];
      (inputs.find((x) => !x.value) ?? inputs[inputs.length - 1])?.focus();
    },
  });

  // Vehicle or avoid options can change the route itself; everything else only re-plans on it.
  const settingsCtl = bindSettings(() => {
    const r = settingsCtl.routing();
    if (routingKey(r.vehicle, r.avoid) !== routedKey) updateRoute();
    else renderRoutes();
  });
  const readSettings = settingsCtl.read;
  const changes = bindChanges($("changes"));
  const renderBreakList = bindBreaks({
    onDuration(i, min) {
      breaks[i] = { ...breaks[i], durationMin: min, auto: false };
      renderRoutes();
    },
    onRemove(i) {
      breaks.splice(i, 1);
      renderRoutes();
    },
    onOvernight(i, resumeMin) {
      const { resumeMin: _old, ...rest } = breaks[i];
      breaks[i] = resumeMin === null ? { ...rest, auto: false } : { ...rest, auto: false, resumeMin };
      renderRoutes();
    },
    onAuto: addAutoBreaks,
  });

  const stopsPanel = createStopsPanel({
    map,
    route: () =>
      routes[selected]
        ? { route: routes[selected], line: lines[selected], scale: scaleOf(selected), timeline: lastTimelines?.[selected] ?? null, points: weatherPoints }
        : null,
    onAdd: addBreakAt,
    onOpen: () => sheet.collapse(),
    onLoaded: () => renderRoutes(), // fuel gaps need the stops
  });

  // ---------- stops ----------

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

  function stopsChanged() {
    gpxRoute = null;
    renderStops();
    updateRoute();
  }

  function setStop(i: number, label: string, pos: LatLon) {
    stops[i] = { label, pos };
    stopsChanged();
  }

  // Puts a stop at a map point with its coordinates as label until the address arrives.
  function placeStop(i: number, pos: LatLon) {
    const target = { label: formatCoord(pos), pos };
    stops[i] = target;
    stopsChanged();
    labelLater(target);
  }

  // "Add stop": the first empty stop, else a new via stop before the end.
  function addStopAt(pos: LatLon) {
    let i = stops.findIndex((s) => !s.pos);
    if (i < 0) {
      i = stops.length - 1;
      stops.splice(i, 0, { label: "", pos: null });
    }
    placeStop(i, pos);
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

  // ---------- routes and breaks ----------

  function selectRoute(i: number) {
    selected = i;
    resnapBreaks();
    renderRoutes();
  }

  // Clicking the selected route adds a break there; clicking an alternative selects it.
  function onRouteClick(i: number, p: LatLon) {
    if (measure.isActive()) return measure.add(p);
    if (i !== selected) return selectRoute(i);
    addBreakAt(p);
  }

  function addBreakAt(pos: LatLon) {
    breaks.push({ pos, durationMin: DEFAULT_BREAK_MIN, auto: false });
    resnapBreaks();
    renderRoutes();
  }

  function moveBreak(i: number, p: LatLon) {
    breaks[i] = { ...breaks[i], pos: p, auto: false };
    resnapBreaks();
    renderRoutes();
  }

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

  function addAutoBreaks(rule: AutoBreakRule, durationMin: number) {
    if (!routes.length) return status(t.app.needRoute, "error");
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
    status(dists.length ? "" : t.app.noAutoBreaks);
  }

  async function updateRoute() {
    const my = ++routeSeq;
    // Empty rows are skipped, like a map app does while a new stop is being typed.
    const filled = stops.flatMap((s) => (s.pos ? [s.pos] : []));
    if (filled.length < 2) {
      routes = [];
      renderRoutes();
      status(filled.length ? t.app.pickEnds : "");
      return;
    }
    status(t.app.routing, "loading");
    const how = settingsCtl.routing();
    routedKey = routingKey(how.vehicle, how.avoid);
    try {
      const result = gpxRoute ? [gpxRoute] : await routeTrip(filled, how.vehicle, how.avoid);
      if (my !== routeSeq) return;
      routes = result;
      lines = result.map((r) => makeLine(r.coords));
      routeLabels = lines.map((l, i) => labelPoint(l, lines.filter((_, j) => j !== i)));
      routeScores = []; // scores belong to the old routes
      routedTitles = filled.map((_, k) => titleOfStop(k, filled.length));
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

  // Everything that follows from routes, breaks and settings: timelines, map, lists, summary.
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
          return { auto: b.auto, durationMin: b.durationMin, distM: at?.distM, startMs: at?.startMs, endMs: at?.endMs, resumeMin: b.resumeMin };
        })
      : [];
    renderBreakList(breakRows);
    renderRouteList(timelines);
    stopsPanel.render();
    share.sync();
    share.renderRecent();
    updateWeather(timelines, typeof settings === "string" ? null : settings);
    if (typeof settings === "string") return renderSummaryInto($("summary"), null, [], settings);
    if (!tl) return renderSummaryInto($("summary"), null, []);
    const rows = summaryRows(
      tl,
      breaks.map((b) => b.resumeMin !== undefined),
      routedTitles,
      settings.speed.mode === "road" ? routes[selected].steps : null,
    );
    renderSummaryInto($("summary"), { arrivalMs: tl.timeMs[tl.timeMs.length - 1], totalS: totalS(tl), distanceM: routes[selected].distanceM }, rows);
  }

  const renderRouteList = (timelines: Timeline[] | null) => renderRouteOptions($("routes"), routes, timelines, routeScores, selected, selectRoute);

  // ---------- weather ----------

  const renderBest = (state: { top: ScoredDeparture[]; loading: boolean; error?: string }) =>
    renderBestList(
      bestEl,
      { ...state, window: bestWindow },
      settingsCtl.best(),
      (ms) => {
        settingsCtl.setBest(ms);
        renderRoutes();
      },
      (w) => {
        bestWindow = w;
        settingsCtl.setBest(null); // pick the best of the new window
        renderBest({ top: [], loading: true });
        renderRoutes();
      },
    );

  const bestHours = () => (bestWindow === "week" ? DEPARTURE.weekDays * 24 : DEPARTURE.windowH);

  // Next 24 hours: the top departures, apart from each other. Next 7 days: the best of each day.
  const pickBest = (all: ScoredDeparture[]) =>
    bestWindow === "week"
      ? // The window ends early on its 8th day; that stub of night hours is not a real choice.
        bestPerDay(all, (ms) => new Date(ms).toDateString(), DEPARTURE.maxMissing).slice(0, DEPARTURE.weekDays)
      : rankDepartures(all, DEPARTURE.count, DEPARTURE.maxMissing, DEPARTURE.minGapH);

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
      renderWarnings($("warnings"), [], false, () => {});
      $("clothing").replaceChildren();
      if (bestMode) renderBest({ top: [], loading: false });
      return renderStrip($("weather"), { points: [], loading: false, onRetry: () => {}, onOpen: () => {} });
    }
    if (bestMode && !bestEl.querySelector(".best-list")) renderBest({ top: [], loading: true });
    const openPoint = (i: number) => {
      sheet.collapse();
      map.openWeather(i);
    };
    const show = (points: WeatherPoint[], loading: boolean, error?: string, extra?: { samples: { distM: number }[]; forecasts: Forecast[] }) => {
      weatherPoints = points;
      map.setWeather(points.map((p) => ({ pos: p.pos, pin: pinHtml(p), card: cardHtml(p) })));
      if (!loading) {
        paintRisk(points);
        const advices = extra ? adviseBreaks(tl, extra.samples, extra.forecasts) : [];
        renderBreakList(breakRows.map((r, i) => ({ ...r, advice: advices[i] })));
        const warnings = collectWarnings(points);
        warnings.push(...fuelWarnings(tl, settings?.fuelRangeKm ?? null));
        advices.forEach((a, i) => {
          const b = tl.breaks[i];
          if (a) warnings.push({ level: 2, text: t.app.breakWarning(i + 1, a), when: `${formatClock(b.startMs)}–${formatClock(b.endMs)}`, where: t.km(Math.round(b.distM / 1000)) });
        });
        renderWarnings($("warnings"), warnings, !error && points.length > 0, openPoint);
        // Change tracking compares planned trips; live mode has its own alerts.
        const trip = currentState();
        if (!error && points.length && trip && !live.isActive()) changes.onForecast(encodeState(trip), tl.timeMs[0], warnings);
        renderClothing($("clothing"), error ? [] : points, vehicle);
        if (!error) live.onWeather(points);
        stopsPanel.render();
      }
      renderStrip($("weather"), { points, loading, error, onRetry: () => updateWeather(timelines, settings), onOpen: openPoint });
    };
    // Keep the old capsules (dimmed) while the next forecast loads.
    show(weatherPoints.length === forecast.sampleCount(selected) ? weatherPoints : [], true);
    weatherTimer = window.setTimeout(async () => {
      try {
        // In best mode the forecast must also reach the arrival of the last candidate.
        const tripMs = tl.timeMs[tl.timeMs.length - 1] - tl.timeMs[0];
        const until = bestMode ? Date.now() + bestHours() * 3_600_000 + tripMs : 0;
        const main = await forecast.pointsFor(selected, tl, vehicle, until);
        freshWeather = false;
        if (my !== weatherSeq) return;
        if (bestMode && settings) {
          const top = pickBest(forecast.scoreDepartures(selected, vehicle, settings.speed, main.samples, main.forecasts, bestHours()));
          // First time in best mode: take the lowest-risk candidate and redo everything for it.
          if (settingsCtl.best() === null && top.length) {
            settingsCtl.setBest(top.reduce((a, b) => (b.score.score < a.score.score ? b : a)).departMs);
            return renderRoutes();
          }
          renderBest({ top, loading: false });
        }
        show(main.points, false, undefined, main);
        // Score every route for the safest-route comparison; the selected one is already done.
        const all = await Promise.all(
          routes.map((_, i) =>
            i === selected ? Promise.resolve(main.points) : forecast.pointsFor(i, timelines[i], vehicle).then((r) => r.points, () => null),
          ),
        );
        if (my !== weatherSeq) return;
        routeScores = all.map((pts, i) => (pts ? forecast.scoreOf(i, timelines[i], pts) : null));
        renderRouteList(timelines);
      } catch (e) {
        if (my !== weatherSeq) return;
        // While riding, a failed refresh (no signal) keeps the last forecast on screen.
        show(live.isActive() ? weatherPoints : [], false, (e as Error).message);
        if (bestMode) renderBest({ top: [], loading: false, error: (e as Error).message });
      }
    }, 300);
  }

  // Stretches without fuel longer than the tank range, with the place to fill up before them.
  // Asks for the route's stops the first time a range is set.
  function fuelWarnings(tl: Timeline, rangeKm: number | null): Warning[] {
    if (rangeKm === null || !routes[selected]) return [];
    const stations = stopsPanel.fuelStops();
    if (!stations) {
      stopsPanel.ensureLoaded();
      return [];
    }
    return fuelGaps(
      stations.map((s) => s.distM),
      routes[selected].distanceM,
      rangeKm * 1000,
    ).map((g) => {
      const before = stations.filter((s) => s.distM <= g.fromM).sort((a, b) => b.distM - a.distM)[0];
      return {
        level: 2,
        text: t.fuel.gap(Math.round((g.toM - g.fromM) / 1000), rangeKm) + (before ? t.fuel.fillUp(before.name) : t.fuel.atStart),
        when: `${formatClock(etaAtDistance(tl, g.fromM))}–${formatClock(etaAtDistance(tl, g.toM))}`,
        where: `${t.km(Math.round(g.fromM / 1000))}–${Math.round(g.toM / 1000)}`,
      };
    });
  }

  // The selected route coloured by risk level, with the dark parts dotted.
  function paintRisk(points: WeatherPoint[]) {
    const scale = scaleOf(selected);
    const totalM = routes[selected].distanceM;
    const cut = (r: { from: number; to: number }) => sliceLine(lines[selected], r.from / scale, r.to / scale);
    map.setRisk(
      pointRuns(points, totalM, (p) => p.risk?.level ?? 0).map((r) => ({ coords: cut(r), level: r.v })),
      pointRuns(points, totalM, (p) => Number(p.risk?.dark ?? false))
        .filter((r) => r.v === 1)
        .map(cut),
    );
  }

  // ---------- share link and recent routes ----------

  const shortLabel = (l: string) => l.split(",").slice(0, 2).join(",").trim().slice(0, SHARE.maxLabel);

  // The trip as it is set now, or null while fewer than two stops are set or a setting is invalid.
  function currentState(): TripState | null {
    const settings = readSettings();
    const filled = stops.filter((s) => s.pos);
    if (typeof settings === "string" || filled.length < 2) return null;
    const sp = settings.speed;
    return {
      stops: filled.map((s) => ({ label: shortLabel(s.label), lat: s.pos!.lat, lon: s.pos!.lon })),
      breaks: breaks.map((b) => ({ lat: b.pos.lat, lon: b.pos.lon, min: b.durationMin, auto: b.auto, resumeMin: b.resumeMin })),
      vehicle: settings.vehicle,
      speed: sp.mode === "average" ? { mode: "average", kmh: sp.kmh } : { mode: "road", ...sp.kmh },
      depart: settings.departMode === "at" ? { mode: "at", ms: settings.departMs } : { mode: settings.departMode },
      avoid: settings.avoid,
      fuelRangeKm: settings.fuelRangeKm,
      selected,
    };
  }

  function applyState(s: TripState) {
    stops.splice(0, stops.length, ...s.stops.map((x) => ({ label: x.label, pos: { lat: x.lat, lon: x.lon } })));
    breaks = s.breaks.map((b) => ({ pos: { lat: b.lat, lon: b.lon }, durationMin: b.min, auto: b.auto, resumeMin: b.resumeMin }));
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

  // ---------- live mode ----------

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
      stops.splice(0, stops.length, { label: t.app.myLocation, pos: from }, ...vias, end);
      breaks = breaks.filter((b) => ahead(b.pos));
      stopsChanged();
    },
    showPosition: (p) => map.setLivePosition(p, $("live").hidden === true),
  });
  $("live-start").addEventListener("click", () => {
    sheet.collapse();
    live.start();
  });

  // Offline: say so; the service worker serves the last routes and forecasts it saw.
  const offlineText = t.app.offline;
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

  // ---------- GPX ----------

  bindGpx({
    status,
    // The track becomes the route itself (no routing server); stops are its two ends.
    async onImport(route, ends) {
      gpxRoute = route;
      const endStops = ends.map((pos) => ({ label: formatCoord(pos), pos }));
      stops.splice(0, stops.length, ...endStops);
      breaks = [];
      renderStops();
      endStops.forEach(labelLater);
      await updateRoute();
    },
    exportData() {
      const route = routes[selected];
      if (!route) return null;
      const tl = lastTimelines?.[selected];
      const named = stops.flatMap((s, i) => (s.pos ? [{ pos: s.pos, name: `${titleOf(i)}: ${s.label.split(",")[0]}` }] : []));
      const breakPts = breaks.map((b, i) => {
        const at = tl?.breaks[i];
        return { pos: snapToLine(lines[selected], b.pos).pos, name: t.breaks.gpxName(i + 1, b.durationMin, at ? formatClock(at.startMs) : null) };
      });
      return {
        route,
        waypoints: [...named, ...breakPts],
        first: stops.find((s) => s.pos)?.label.split(",")[0] ?? t.app.start,
        last: [...stops].reverse().find((s) => s.pos)?.label.split(",")[0] ?? t.app.end,
      };
    },
  });

  // ---------- trip card buttons, start ----------

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

  renderStops();
  if (!share.applyHash()) share.renderRecent();
}
