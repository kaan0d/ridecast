import { SAFEST_MIN_DROP } from "../config/risk";
import { ROAD_TYPE_RULES } from "../config/vehicles";
import { totalS, tripDays, type Timeline } from "../core/eta/eta";
import { roadBreakdown, type Step } from "../core/route/roadType";
import { chooseSafest, type RouteScore } from "../core/risk/route";
import type { Route } from "../services/osrm";
import { formatClock, formatDay, formatDuration, formatKm, formatTime } from "./format";
import { LEVEL_LABEL } from "./weather";

// Big arrival time, then the details as a grouped list.
export function renderSummary(
  el: HTMLElement,
  eta: { arrivalMs: number; totalS: number; distanceM: number } | null,
  rows: [string, string][],
  error?: string,
) {
  if (error) {
    const p = document.createElement("p");
    p.className = "eta-error";
    p.textContent = error;
    return el.replaceChildren(p);
  }
  if (!eta) return el.replaceChildren();
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
  el.replaceChildren(head, dl);
}

// Route options with duration and, once forecasts are in, risk and the safest-route mark.
export function renderRouteList(
  el: HTMLElement,
  routes: Route[],
  timelines: Timeline[] | null,
  scores: (RouteScore | null)[],
  selected: number,
  onSelect: (i: number) => void,
) {
  const choice =
    timelines && scores.length === routes.length
      ? chooseSafest(
          routes.map((_, i) => ({ durationS: totalS(timelines[i]), score: scores[i] })),
          SAFEST_MIN_DROP,
        )
      : null;
  el.replaceChildren(
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
      const score = scores[i];
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
      b.addEventListener("click", () => onSelect(i));
      li.append(b);
      return li;
    }),
  );
}

// Detail rows under the arrival time: breaks, departure, one row per day of a multi-day trip,
// the arrival at each stop, and in road-speed mode the km per guessed road type.
export function summaryRows(t: Timeline, overnight: boolean[], stopTitles: string[], roadSteps: Step[] | null): [string, string][] {
  const shortBreaks = t.breaks.filter((_, i) => !overnight[i]);
  const days = tripDays(t, overnight);
  const rows: [string, string][] = [
    ...(shortBreaks.length
      ? [["Molalar", `${shortBreaks.length} mola · ${formatDuration(shortBreaks.reduce((s, b) => s + b.endMs - b.startMs, 0) / 1000)}`] as [string, string]]
      : []),
    ["Çıkış", formatTime(t.timeMs[0])],
    ...(days.length > 1
      ? days.map((d, k): [string, string] => [`${k + 1}. gün`, `${formatTime(d.startMs)}–${formatClock(d.endMs)} · ${formatKm(d.toM - d.fromM)}`])
      : []),
    ...t.legArrivalMs.map((ms, i): [string, string] => [`${stopTitles[i + 1]} varış`, formatTime(ms)]),
  ];
  if (roadSteps) {
    const b = roadBreakdown(roadSteps, ROAD_TYPE_RULES);
    const parts: [string, number][] = [
      ["Otoyol", b.motorway],
      ["Ana yol", b.primary],
      ["Şehir içi", b.urban],
      ["Feribot", b.ferry],
    ];
    rows.push(["Yol tipi (tahmin)", parts.filter(([, m]) => m > 0).map(([n, m]) => `${n} ${formatKm(m)}`).join(" · ")]);
  }
  return rows;
}
