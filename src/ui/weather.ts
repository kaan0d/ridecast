import { WEATHER_REQUEST } from "../config/weather";
import type { WarningSnap } from "../core/advice/changes";
import type { Assessment, Level, RoadState } from "../core/risk/risk";
import { compassIndex, conditionOf, type Condition, type WeatherHour } from "../core/weather/weather";
import { t } from "../i18n";
import type { LatLon } from "../core/geo";
import { formatClock } from "./format";
import { icons, type WeatherIcon } from "./icons";

export interface WeatherPoint {
  pos: LatLon;
  distM: number;
  etaMs: number;
  hour: WeatherHour | null; // null: no forecast for that time
  risk: Assessment | null;
}

export const LEVEL_LABEL = t.level;
const ROAD_LABEL: Record<RoadState, string> = t.weather.road;
const dot = (level: Level) => `<span class="risk-dot risk-${level}" aria-hidden="true"></span>`;

const ICON: Record<Condition, WeatherIcon> = {
  clear: "sun",
  partly: "partly",
  cloudy: "cloud",
  fog: "fog",
  drizzle: "drizzle",
  rain: "rain",
  snow: "snow",
  storm: "storm",
};

const deg = (v: number) => `${Math.round(v)}°`;
const km = (m: number) => t.km(Math.round(m / 1000));

export function weatherIcon(h: WeatherHour | null): string {
  if (!h) return "";
  const icon = ICON[conditionOf(h.code).kind];
  if (!h.isDay && icon === "sun") return icons.moon;
  if (!h.isDay && icon === "partly") return icons.partlyNight;
  return icons[icon];
}

// Tag shown on the map above its station: arrival time, icon, temperature and the risk mark.
export function pinHtml(p: WeatherPoint): string {
  const level = p.risk?.level ?? 0;
  return p.hour
    ? `<span class="wx-pin risk-${level}"><span class="wx-tag"><i>${formatClock(p.etaMs)}</i>${weatherIcon(p.hour)}<b>${deg(p.hour.tempC)}</b>${level ? dot(level) : ""}</span></span>`
    : `<span class="wx-pin wx-none"><span class="wx-tag">–</span></span>`;
}

// Card shown when a capsule is opened.
export function cardHtml(p: WeatherPoint): string {
  const head = `<div class="wx-head"><span>${t.weather.arrival(formatClock(p.etaMs))}</span><span>${km(p.distM)}</span></div>`;
  const h = p.hour;
  if (!h) return `<div class="wx-card">${head}<p class="wx-empty">${t.weather.noForecast}</p></div>`;
  const c = conditionOf(h.code);
  const precip = `${h.precipMm.toFixed(1)} mm${h.precipProb === null ? "" : ` · ${h.precipProb}%`}${h.snowCm > 0 ? ` · ${t.weather.snow(h.snowCm.toFixed(1))}` : ""}`;
  // The arrow points where the wind blows to.
  const arrow = `<span class="wx-arrow" style="transform:rotate(${h.windFromDeg + 180}deg)">${icons.arrowUp}</span>`;
  const gust = t.weather.gusts(Math.round(h.gustKmh));
  const wind = h.windKmh < 1 ? `${t.weather.calm} · ${gust}` : `${arrow}${Math.round(h.windKmh)} ${t.kmh} ${t.compass[compassIndex(h.windFromDeg)]} · ${gust}`;
  const vis = h.visibilityM >= 10_000 ? `${Math.round(h.visibilityM / 1000)} km` : `${(h.visibilityM / 1000).toFixed(1)} km`;
  return `<div class="wx-card">${head}
    <div class="wx-main"><span class="wx-big">${weatherIcon(h)}</span><span class="wx-temp">${deg(h.tempC)}</span><span class="wx-cond">${t.conditions[c.name]}</span></div>
    <dl class="wx-rows">
      <div><dt>${t.weather.feelsLike}</dt><dd>${deg(h.feelsC)}</dd></div>
      ${p.risk ? `<div><dt>${t.weather.ridingFeel}</dt><dd>${deg(p.risk.feltC)}</dd></div>` : ""}
      <div><dt>${t.weather.precip}</dt><dd>${precip}</dd></div>
      <div><dt>${t.weather.wind}</dt><dd>${wind}</dd></div>
      <div><dt>${t.weather.visibility}</dt><dd>${vis}</dd></div>
      ${p.risk ? `<div><dt>${t.weather.roadEstimate}</dt><dd>${ROAD_LABEL[p.risk.road]}</dd></div>` : ""}
    </dl>
    ${p.risk?.events.length ? `<ul class="wx-warn">${p.risk.events.map((e) => `<li>${dot(e.level)}${e.text}</li>`).join("")}</ul>` : ""}
    ${p.etaMs - Date.now() > WEATHER_REQUEST.farDays * 86_400_000 ? `<p class="wx-far">${t.weather.far(WEATHER_REQUEST.farDays)}</p>` : ""}
    <p class="wx-source">${t.weather.source(formatClock(h.timeMs))}</p>
  </div>`;
}

// Line strip in the sheet: every station on one rail with time, risk mark, icon, temperature and km
// (the ends: the stop names); it scrolls to the right. The rail after a station takes its risk
// colour, dotted where it is dark. `arrive`: the first render for a route, the stations come in
// left to right.
export function renderStrip(
  el: HTMLElement,
  state: { points: WeatherPoint[]; loading: boolean; error?: string; arrive?: boolean; ends?: [string, string]; onRetry(): void; onOpen(i: number): void },
) {
  if (!state.points.length && !state.loading && !state.error) return el.replaceChildren();
  const title = document.createElement("h2");
  title.className = "group-title";
  title.textContent = t.weather.stripTitle;
  const parts: HTMLElement[] = [title];

  if (state.error) {
    const p = document.createElement("p");
    p.className = "wx-status error";
    p.textContent = `${state.error} `;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "link-button";
    retry.textContent = t.weather.retry;
    retry.addEventListener("click", state.onRetry);
    p.append(retry);
    parts.push(p);
  } else if (state.loading && !state.points.length) {
    const p = document.createElement("p");
    p.className = "wx-status loading";
    const text = document.createElement("span");
    text.className = "shimmer";
    text.textContent = text.dataset.text = t.weather.loading;
    p.append(text);
    parts.push(p);
  }

  if (state.points.length) {
    const list = document.createElement("ol");
    list.className = "wx-strip";
    list.classList.toggle("stale", state.loading);
    list.classList.toggle("arrive", !!state.arrive);
    const n = state.points.length;
    state.points.forEach((pt, i) => {
      const li = document.createElement("li");
      li.style.setProperty("--i", String(i));
      const b = document.createElement("button");
      b.type = "button";
      const level = pt.risk?.level ?? 0;
      if (level) b.classList.add(`rail-${level}`);
      if (pt.risk?.dark) b.classList.add("rail-dark");
      const c = pt.hour ? t.conditions[conditionOf(pt.hour.code).name] : t.weather.noData;
      b.setAttribute("aria-label", `${formatClock(pt.etaMs)}, ${km(pt.distM)}: ${pt.hour ? deg(pt.hour.tempC) + ", " : ""}${c}`);
      b.innerHTML = `<span class="wx-t">${formatClock(pt.etaMs)}</span><span class="station risk-${level}"></span>${weatherIcon(pt.hour) || '<span class="wx-dash">–</span>'}<span class="wx-deg">${pt.hour ? deg(pt.hour.tempC) : ""}</span><span class="wx-km">${km(pt.distM)}</span>`;
      const end = i === 0 ? state.ends?.[0] : i === n - 1 ? state.ends?.[1] : undefined;
      if (end) b.querySelector(".wx-km")!.textContent = end;
      b.addEventListener("click", () => state.onOpen(i));
      b.classList.toggle("far", pt.etaMs - Date.now() > WEATHER_REQUEST.farDays * 86_400_000); // uncertain, drawn dashed
      li.append(b);
      list.append(li);
    });
    parts.push(list);
  }
  // Re-renders (a new forecast, an edit) keep the place the rider scrolled to.
  const scrolled = el.querySelector(".wx-strip")?.scrollLeft ?? 0;
  el.replaceChildren(...parts);
  const strip = el.querySelector(".wx-strip");
  if (strip && !state.arrive) strip.scrollLeft = scrolled;
}

export interface Warning {
  level: Level;
  text: string;
  when: string; // time range
  where: string; // km range
  open?: number; // weather point to open on click
  run?: WarningSnap; // the run behind a weather warning (kind, level, km, start), for change tracking
}

// Consecutive points with the same kind of warning become one row, at the worst level seen.
export function collectWarnings(points: WeatherPoint[]): Warning[] {
  const out: (Warning & { startMs: number; run: WarningSnap })[] = [];
  const open = new Map<string, { from: number; to: number; worst: number }>();
  const close = (kind: string) => {
    const r = open.get(kind)!;
    open.delete(kind);
    const a = points[r.from];
    const b = points[r.to];
    const worst = points[r.worst].risk!.events.find((e) => e.kind === kind)!;
    out.push({
      level: worst.level,
      text: worst.text,
      when: r.from === r.to ? formatClock(a.etaMs) : `${formatClock(a.etaMs)}–${formatClock(b.etaMs)}`,
      where: r.from === r.to ? km(a.distM) : `${km(a.distM)}–${Math.round(b.distM / 1000)}`,
      open: r.worst,
      startMs: a.etaMs,
      run: { kind: worst.kind, level: worst.level, text: worst.text, fromM: a.distM, toM: b.distM, startMs: a.etaMs },
    });
  };
  points.forEach((p, i) => {
    const kinds = new Set(p.risk?.events.map((e) => e.kind) ?? []);
    for (const kind of [...open.keys()]) if (!kinds.has(kind as never)) close(kind);
    for (const e of p.risk?.events ?? []) {
      const r = open.get(e.kind);
      if (!r) open.set(e.kind, { from: i, to: i, worst: i });
      else {
        r.to = i;
        const prev = points[r.worst].risk!.events.find((x) => x.kind === e.kind)!;
        if (e.level > prev.level) r.worst = i;
      }
    }
  });
  for (const kind of [...open.keys()]) close(kind);
  return out.sort((a, b) => a.startMs - b.startMs || b.level - a.level);
}

export function renderWarnings(el: HTMLElement, warnings: Warning[], ready: boolean, onOpen: (i: number) => void) {
  if (!ready) return el.replaceChildren();
  const title = document.createElement("h2");
  title.className = "group-title";
  title.textContent = t.weather.warnings;
  const list = document.createElement("ol");
  list.className = "group warn-list";
  if (!warnings.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = t.weather.noWarnings;
    list.append(li);
  }
  for (const w of warnings) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "warn";
    b.setAttribute("aria-label", t.weather.warnAria(LEVEL_LABEL[w.level], w.text, w.when, w.where));
    b.innerHTML = `${dot(w.level)}<span class="warn-text">${w.text}</span><span class="warn-meta">${w.when ? w.when + " · " : ""}${w.where}</span>`;
    if (w.open !== undefined) b.addEventListener("click", () => onOpen(w.open!));
    else b.disabled = true;
    li.append(b);
    list.append(li);
  }
  el.replaceChildren(title, list);
}
