import { ELEVATION } from "../config/elevation";
import { climbOf } from "../core/route/elevation";
import { t } from "../i18n";
import { formatClock } from "./format";
import type { WeatherPoint } from "./weather";

export interface Profile {
  distsM: number[];
  heightsM: number[];
}

const W = 600; // viewBox units; the SVG stretches to the panel width
const H = 110;
const PAD_TOP = 10;
const MIN_SPAN_M = 200; // a flat route stays flat instead of filling the chart with noise
const MIN_SPAN_C = 10;

const r = Math.round;
const km = (m: number) => r(m / 1000);

// The nearest weather station to a distance, if it has a forecast.
function tempAt(points: WeatherPoint[], distM: number) {
  let best: WeatherPoint | null = null;
  for (const p of points) if (p.hour && (!best || Math.abs(p.distM - distM) < Math.abs(best.distM - distM))) best = p;
  return best;
}

// Height along the route as an area, the forecast temperature at each station's arrival as a
// dashed line over it (its own scale), a summary line, and a cursor: pointer or arrow keys move
// along the route and `onProbe` shows the point on the map (null when it leaves).
export function renderProfile(
  el: HTMLElement,
  state: { profile: Profile | null; loading: boolean; error?: string; points: WeatherPoint[]; onProbe(distM: number | null): void },
) {
  if (!state.profile && !state.loading && !state.error) return el.replaceChildren();
  const title = document.createElement("h2");
  title.className = "group-title";
  title.textContent = t.profile.title;
  if (!state.profile) {
    const p = document.createElement("p");
    p.className = `wx-status ${state.error ? "error" : "loading"}`;
    p.textContent = state.error ?? t.profile.loading;
    return el.replaceChildren(title, p);
  }

  const { distsM, heightsM } = state.profile;
  const totalM = distsM[distsM.length - 1] || 1;
  const climb = climbOf(distsM, heightsM, ELEVATION.noiseM);
  const lo = Math.min(climb.minM, climb.maxM - MIN_SPAN_M);
  const span = Math.max(climb.maxM - lo, MIN_SPAN_M);
  const x = (d: number) => (d / totalM) * W;
  const y = (h: number) => PAD_TOP + (1 - (h - lo) / span) * (H - PAD_TOP);
  const line = distsM.map((d, i) => `${x(d).toFixed(1)},${y(heightsM[i]).toFixed(1)}`).join(" L");
  const temps = state.points.filter((p) => p.hour);
  let tempPath = "";
  if (temps.length > 1) {
    const cs = temps.map((p) => p.hour!.tempC);
    const cLo = Math.min(...cs);
    const cSpan = Math.max(Math.max(...cs) - cLo, MIN_SPAN_C);
    // Upper half of the chart, so it reads apart from the ground.
    tempPath = temps.map((p, i) => `${i ? "L" : "M"}${x(p.distM).toFixed(1)},${(PAD_TOP + (1 - (p.hour!.tempC - cLo) / cSpan) * (H / 2)).toFixed(1)}`).join(" ");
  }

  const summary = [t.profile.climb(r(climb.gainM), r(climb.lossM)), t.profile.highest(r(climb.maxM), km(climb.maxAtM))];
  const coldest = temps.reduce<WeatherPoint | null>((a, b) => (!a || b.hour!.tempC < a.hour!.tempC ? b : a), null);
  if (coldest) summary.push(t.profile.coldest(r(coldest.hour!.tempC), km(coldest.distM), formatClock(coldest.etaMs)));
  const readout = document.createElement("p");
  readout.className = "profile-readout";
  const idle = summary.join(", ");
  readout.textContent = idle;

  const chart = document.createElement("div");
  chart.className = "profile-chart";
  chart.tabIndex = 0;
  // A slider over the route's distance: arrow keys move the cursor, the readout is its value text.
  chart.setAttribute("role", "slider");
  chart.setAttribute("aria-label", t.profile.aria);
  chart.setAttribute("aria-valuemin", "0");
  chart.setAttribute("aria-valuemax", String(km(totalM)));
  chart.setAttribute("aria-valuenow", "0");
  chart.setAttribute("aria-valuetext", idle);
  chart.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">` +
    `<path class="profile-area" d="M0,${H} L${line} L${W},${H} Z"/>` +
    `<path class="profile-line" d="M${line}"/>` +
    (tempPath ? `<path class="profile-temp" d="${tempPath}"/>` : "") +
    `<line class="profile-cursor" x1="0" x2="0" y1="0" y2="${H}" visibility="hidden"/>` +
    `</svg>`;
  const cursor = chart.querySelector<SVGLineElement>(".profile-cursor")!;

  let at = -1; // index of the point under the cursor
  const show = (i: number | null) => {
    if (i === null) {
      at = -1;
      cursor.setAttribute("visibility", "hidden");
      readout.textContent = idle;
      chart.setAttribute("aria-valuetext", idle);
      return state.onProbe(null);
    }
    at = Math.max(0, Math.min(distsM.length - 1, i));
    const d = distsM[at];
    cursor.setAttribute("x1", String(x(d)));
    cursor.setAttribute("x2", String(x(d)));
    cursor.setAttribute("visibility", "visible");
    const w = tempAt(state.points, d);
    readout.textContent = t.profile.at(km(d), r(heightsM[at])) + (w ? ` · ${t.profile.temp(r(w.hour!.tempC), formatClock(w.etaMs))}` : "");
    chart.setAttribute("aria-valuenow", String(km(d)));
    chart.setAttribute("aria-valuetext", readout.textContent);
    state.onProbe(d);
  };
  const indexAt = (clientX: number) => {
    const box = chart.getBoundingClientRect();
    return r(((clientX - box.left) / box.width) * (distsM.length - 1));
  };
  chart.addEventListener("pointermove", (e) => show(indexAt(e.clientX)));
  chart.addEventListener("pointerdown", (e) => show(indexAt(e.clientX)));
  chart.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && show(null));
  chart.addEventListener("blur", () => show(null));
  chart.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowRight") show(at < 0 ? 0 : at + step);
    else if (e.key === "ArrowLeft") show(at < 0 ? distsM.length - 1 : at - step);
    else if (e.key === "Home") show(0);
    else if (e.key === "End") show(distsM.length - 1);
    else if (e.key === "Escape") show(null);
    else return;
    e.preventDefault();
  });

  el.replaceChildren(title, readout, chart);
}
