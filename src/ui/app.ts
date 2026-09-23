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
import { reverseLabel } from "../services/nominatim";
import { getRoutes, type Route } from "../services/osrm";
import { bindBreaks } from "./breaks";
import { formatClock, formatCoord, formatDay, formatDuration, formatKm, formatTime } from "./format";
import { icons } from "./icons";
import { createMap, type StopKind } from "./map";
import { placeInput } from "./search";
import { bindSettings } from "./settings";
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
  let breakRows: BreakRow[] = [];
  let routeScores: (RouteScore | null)[] = []; // per route, filled when their forecasts arrive
  let weatherSeq = 0;
  let weatherTimer: number | undefined;
  let weatherPoints: WeatherPoint[] = [];
  const sheet = bindSheet();
  const map = createMap($("map"), onMapClick);
  const readSettings = bindSettings(renderRoutes);
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
  async function pointsFor(i: number, tl: Timeline, vehicle: VehicleType) {
    const route = routes[i];
    const line = lines[i];
    const scale = scaleOf(i);
    const samples = sampleDistances(route.distanceM, route.durationS, WEATHER_SAMPLE.intervalMin, WEATHER_SAMPLE.maxPoints).map((d) => ({
      distM: d,
      pos: pointAtDistance(line, d / scale),
      etaMs: etaAtDistance(tl, d),
    }));
    const forecasts = await fetchForecast(
      samples.map((p) => p.pos),
      samples[samples.length - 1].etaMs,
    );
    const points = samples.map((p, k): WeatherPoint => {
      const f = forecasts[k] ?? { hours: [], sun: [] };
      const idx = nearestHourIndex(f.hours, p.etaMs, WEATHER_REQUEST.maxHourGapMin);
      if (idx < 0) return { ...p, hour: null, risk: null };
      const risk = assessPoint(
        { hours: f.hours, i: idx, etaMs: p.etaMs, rideKmh: speedAtDistance(tl, p.distM), headingDeg: bearingAt(line, p.distM / scale), sun: f.sun },
        RISK[vehicle],
        WET_ROAD,
      );
      return { ...p, hour: f.hours[idx], risk };
    });
    return { samples, forecasts, points };
  }

  function updateWeather(timelines: Timeline[] | null, vehicle: VehicleType) {
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
      return renderStrip(weatherEl, { points: [], loading: false, onRetry: () => {}, onOpen: () => {} });
    }
    const sampleCount = sampleDistances(route.distanceM, route.durationS, WEATHER_SAMPLE.intervalMin, WEATHER_SAMPLE.maxPoints).length;
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
      }
      renderStrip(weatherEl, { points, loading, error, onRetry: () => updateWeather(timelines, vehicle), onOpen: openPoint });
    };
    // Keep the old capsules (dimmed) while the next forecast loads.
    show(weatherPoints.length === sampleCount ? weatherPoints : [], true);
    weatherTimer = window.setTimeout(async () => {
      try {
        const main = await pointsFor(selected, tl, vehicle);
        if (my !== weatherSeq) return;
        show(main.points, false, undefined, main);
        // Score every route for the safest-route comparison; the selected one is already done.
        const all = await Promise.all(
          routes.map((_, i) => (i === selected ? Promise.resolve(main.points) : pointsFor(i, timelines[i], vehicle).then((r) => r.points, () => null))),
        );
        if (my !== weatherSeq) return;
        routeScores = all.map((pts, i) =>
          pts ? routeScore(pts.map((p) => ({ distM: p.distM, level: p.risk ? p.risk.level : null })), routes[i].distanceM, RISK_WEIGHTS) : null,
        );
        renderRouteList(timelines);
      } catch (e) {
        if (my === weatherSeq) show([], false, (e as Error).message);
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
    breakRows = routes.length
      ? breaks.map((b, i) => {
          const at = tl?.breaks[i];
          return { auto: b.auto, durationMin: b.durationMin, distM: at?.distM, startMs: at?.startMs, endMs: at?.endMs };
        })
      : [];
    renderBreakList(breakRows);
    renderRouteList(timelines);
    updateWeather(timelines, typeof settings === "string" ? "motorcycle" : settings.vehicle);
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
      selected = 0;
      resnapBreaks();
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
}

const totalS = (t: Timeline) => (t.timeMs[t.timeMs.length - 1] - t.timeMs[0]) / 1000;
