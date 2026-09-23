import type { Assessment, Level, RoadState } from "../core/risk/risk";
import { compass, conditionOf, type Condition, type WeatherHour } from "../core/weather/weather";
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

export const LEVEL_LABEL = ["Yok", "Düşük", "Orta", "Yüksek"];
const ROAD_LABEL: Record<RoadState, string> = { dry: "Kuru", damp: "Nemli", wet: "Islak", ice: "Buzlanma riski" };
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
const km = (m: number) => `km ${Math.round(m / 1000)}`;

export function weatherIcon(h: WeatherHour | null): string {
  if (!h) return "";
  const icon = ICON[conditionOf(h.code).kind];
  if (!h.isDay && icon === "sun") return icons.moon;
  if (!h.isDay && icon === "partly") return icons.partlyNight;
  return icons[icon];
}

// Capsule shown on the map.
export function pinHtml(p: WeatherPoint): string {
  return p.hour
    ? `<span class="wx-pin risk-${p.risk?.level ?? 0}">${weatherIcon(p.hour)}<b>${deg(p.hour.tempC)}</b></span>`
    : `<span class="wx-pin wx-none">–</span>`;
}

// Card shown when a capsule is opened.
export function cardHtml(p: WeatherPoint): string {
  const head = `<div class="wx-head"><span>${formatClock(p.etaMs)} varış</span><span>${km(p.distM)}</span></div>`;
  const h = p.hour;
  if (!h) return `<div class="wx-card">${head}<p class="wx-empty">Bu saat için tahmin yok.</p></div>`;
  const c = conditionOf(h.code);
  const precip = `${h.precipMm.toFixed(1)} mm${h.precipProb === null ? "" : ` · %${h.precipProb}`}${h.snowCm > 0 ? ` · kar ${h.snowCm.toFixed(1)} cm` : ""}`;
  // The arrow points where the wind blows to.
  const arrow = `<span class="wx-arrow" style="transform:rotate(${h.windFromDeg + 180}deg)">${icons.arrowUp}</span>`;
  const gust = `hamle ${Math.round(h.gustKmh)}`;
  const wind = h.windKmh < 1 ? `Sakin · ${gust}` : `${arrow}${Math.round(h.windKmh)} km/s ${compass(h.windFromDeg)} · ${gust}`;
  const vis = h.visibilityM >= 10_000 ? `${Math.round(h.visibilityM / 1000)} km` : `${(h.visibilityM / 1000).toFixed(1)} km`;
  return `<div class="wx-card">${head}
    <div class="wx-main"><span class="wx-big">${weatherIcon(h)}</span><span class="wx-temp">${deg(h.tempC)}</span><span class="wx-cond">${c.label}</span></div>
    <dl class="wx-rows">
      <div><dt>Hissedilen</dt><dd>${deg(h.feelsC)}</dd></div>
      ${p.risk ? `<div><dt>Sürüşte hissedilen</dt><dd>${deg(p.risk.feltC)}</dd></div>` : ""}
      <div><dt>Yağış</dt><dd>${precip}</dd></div>
      <div><dt>Rüzgar</dt><dd>${wind}</dd></div>
      <div><dt>Görüş</dt><dd>${vis}</dd></div>
      ${p.risk ? `<div><dt>Yol (tahmin)</dt><dd>${ROAD_LABEL[p.risk.road]}</dd></div>` : ""}
    </dl>
    ${p.risk?.events.length ? `<ul class="wx-warn">${p.risk.events.map((e) => `<li>${dot(e.level)}${e.text}</li>`).join("")}</ul>` : ""}
    <p class="wx-source">Tahmin saati ${formatClock(h.timeMs)} · Open-Meteo</p>
  </div>`;
}

// Horizontal strip in the sheet: time, icon, temperature per point.
export function renderStrip(
  el: HTMLElement,
  state: { points: WeatherPoint[]; loading: boolean; error?: string; onRetry(): void; onOpen(i: number): void },
) {
  if (!state.points.length && !state.loading && !state.error) return el.replaceChildren();
  const title = document.createElement("h2");
  title.className = "group-title";
  title.textContent = "Yol boyunca hava";
  const parts: HTMLElement[] = [title];

  if (state.error) {
    const p = document.createElement("p");
    p.className = "wx-status error";
    p.textContent = `${state.error} `;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "link-button";
    retry.textContent = "Tekrar dene";
    retry.addEventListener("click", state.onRetry);
    p.append(retry);
    parts.push(p);
  } else if (state.loading && !state.points.length) {
    const p = document.createElement("p");
    p.className = "wx-status loading";
    p.textContent = "Hava durumu alınıyor…";
    parts.push(p);
  }

  if (state.points.length) {
    const list = document.createElement("ol");
    list.className = "wx-strip";
    list.classList.toggle("stale", state.loading);
    state.points.forEach((pt, i) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      const c = pt.hour ? conditionOf(pt.hour.code).label : "tahmin yok";
      b.setAttribute("aria-label", `${formatClock(pt.etaMs)}, ${km(pt.distM)}: ${pt.hour ? deg(pt.hour.tempC) + ", " : ""}${c}`);
      b.innerHTML = `<span class="wx-t">${formatClock(pt.etaMs)}</span>${weatherIcon(pt.hour) || '<span class="wx-dash">–</span>'}<span class="wx-deg">${pt.hour ? deg(pt.hour.tempC) : ""}</span><span class="wx-km">${km(pt.distM)}</span>`;
      b.addEventListener("click", () => state.onOpen(i));
      li.append(b);
      list.append(li);
    });
    parts.push(list);
  }
  el.replaceChildren(...parts);
}

export interface Warning {
  level: Level;
  text: string;
  when: string; // time range
  where: string; // km range
  open?: number; // weather point to open on click
}

// Consecutive points with the same kind of warning become one row, at the worst level seen.
export function collectWarnings(points: WeatherPoint[]): Warning[] {
  const out: (Warning & { startMs: number })[] = [];
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
  title.textContent = "Uyarılar";
  const list = document.createElement("ol");
  list.className = "group warn-list";
  if (!warnings.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Bu yolculukta uyarı yok.";
    list.append(li);
  }
  for (const w of warnings) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "warn";
    b.setAttribute("aria-label", `${LEVEL_LABEL[w.level]} risk: ${w.text}${w.when ? ", " + w.when : ""}, ${w.where}`);
    b.innerHTML = `${dot(w.level)}<span class="warn-text">${w.text}</span><span class="warn-meta">${w.when ? w.when + " · " : ""}${w.where}</span>`;
    if (w.open !== undefined) b.addEventListener("click", () => onOpen(w.open!));
    else b.disabled = true;
    li.append(b);
    list.append(li);
  }
  el.replaceChildren(title, list);
}
