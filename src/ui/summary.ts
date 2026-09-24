import { dec1, t } from "../i18n";
import { SAFEST_MIN_DROP } from "../config/risk";
import { ROAD_TYPE_RULES } from "../config/vehicles";
import { totalS, tripDays, type Timeline } from "../core/eta/eta";
import { roadBreakdown, type Step } from "../core/route/roadType";
import { chooseSafest, type RouteScore } from "../core/risk/route";
import type { Route } from "../services/osrm";
import { formatClock, formatDay, formatDuration, formatKm, formatTime } from "./format";
import { LEVEL_LABEL } from "./weather";

// Digits roll to their value like a counter: each digit is a reel of 0-9 slid into place, other
// characters stay. A new shape (another digit count) builds fresh reels that roll in from 0.
export function roll(el: HTMLElement, text: string) {
  const chars = [...text];
  const shape = chars.map((c) => (/\d/.test(c) ? "#" : c)).join("");
  if (el.dataset.shape !== shape) {
    el.dataset.shape = shape;
    el.replaceChildren(
      Object.assign(document.createElement("span"), { className: "sr-only" }),
      ...chars.map((c) => {
        const cell = document.createElement("span");
        cell.setAttribute("aria-hidden", "true");
        if (!/\d/.test(c)) {
          cell.className = "roll-sep";
          cell.textContent = c;
          return cell;
        }
        cell.className = "roll-col";
        const reel = document.createElement("span");
        for (let d = 0; d < 10; d++) reel.append(Object.assign(document.createElement("span"), { textContent: String(d) }));
        cell.append(reel);
        return cell;
      }),
    );
    void el.offsetWidth; // reels start at 0, so the first values roll in
  }
  el.querySelector(".sr-only")!.textContent = text;
  el.querySelectorAll<HTMLElement>(".roll-col > span").forEach((reel, i) => {
    const d = Number(text.replace(/\D/g, "")[i]);
    reel.style.transitionDelay = `${i * 70}ms`;
    reel.style.transform = `translateY(-${d * 10}%)`;
  });
}

export interface Eta {
  departMs: number;
  arrivalMs: number;
  totalS: number;
  distanceM: number;
  from: string; // stop names at both ends
  to: string;
}

// The departure board line: the arrival in big rolling digits with its day, then one timetable row,
// departure time and place, the rail with duration and distance, the destination. The row is a
// button that opens the stop editor (sheet.ts hides the trip card while a route shows). The head
// stays in place between renders, so a changed arrival rolls from the old time to the new one.
// Extra rows (breaks, days, via arrivals, road types) follow as a grouped list.
export function renderSummary(el: HTMLElement, eta: Eta | null, rows: [string, string][], error?: string) {
  if (error) {
    const p = document.createElement("p");
    p.className = "eta-error";
    p.textContent = error;
    return el.replaceChildren(p);
  }
  if (!eta) return el.replaceChildren();
  let head = el.querySelector<HTMLElement>(":scope > .eta");
  if (!head) {
    head = document.createElement("div");
    head.className = "eta";
    head.innerHTML = `<strong class="eta-time"><span class="roll"></span><small><span class="eta-label"></span><span class="eta-day"></span></small></strong>
      <button type="button" class="eta-route" aria-expanded="false"><span class="er-end er-from"><b></b><span></span></span><span class="er-rail"><span></span></span><span class="er-end er-to"><span></span></span></button>`;
    el.replaceChildren(head);
  }
  roll(head.querySelector(".roll")!, formatClock(eta.arrivalMs));
  head.querySelector(".eta-label")!.textContent = t.summary.arrival;
  head.querySelector(".eta-day")!.textContent = formatDay(eta.arrivalMs);
  const route = head.querySelector(".eta-route")!;
  route.setAttribute("aria-label", t.summary.editStops(eta.from, eta.to));
  route.querySelector(".er-from b")!.textContent = formatClock(eta.departMs);
  route.querySelector(".er-from span")!.textContent = eta.from;
  route.querySelector(".er-rail span")!.textContent = `${formatDuration(eta.totalS)} · ${formatKm(eta.distanceM)}`;
  route.querySelector(".er-to span")!.textContent = eta.to;

  if (!rows.length) {
    for (const old of el.querySelectorAll(":scope > :not(.eta)")) old.remove();
    return;
  }
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
  for (const old of el.querySelectorAll(":scope > :not(.eta)")) old.remove();
  el.append(dl);
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
      name.textContent = i === 0 ? t.summary.suggested : t.summary.alternative(i);
      const sub = document.createElement("span");
      sub.className = "sub";
      const score = scores[i];
      sub.textContent = formatKm(r.distanceM);
      if (score) {
        const risk = document.createElement("span");
        risk.className = "route-risk";
        risk.innerHTML = `<span class="risk-dot risk-${score.worst}" aria-hidden="true"></span>`;
        risk.append(t.summary.risk(dec1(score.score), LEVEL_LABEL[score.worst].toLowerCase()));
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
            ? t.summary.fastestToo
            : t.summary.saferBy(`${choice.extraMin >= 0 ? "+" : "−"}${Math.abs(choice.extraMin)}`, Math.round(choice.riskDrop * 100));
        badge.innerHTML = `<b>${t.summary.safest}</b><span>${diff}</span>`;
        b.append(badge);
      }
      b.addEventListener("click", () => onSelect(i));
      li.append(b);
      return li;
    }),
  );
}

// Detail rows under the arrival time: breaks, one row per day of a multi-day trip, the arrival at
// each via stop, and in road-speed mode the km per guessed road type.
export function summaryRows(tl: Timeline, overnight: boolean[], stopTitles: string[], roadSteps: Step[] | null): [string, string][] {
  const shortBreaks = tl.breaks.filter((_, i) => !overnight[i]);
  const days = tripDays(tl, overnight);
  const rows: [string, string][] = [
    ...(shortBreaks.length
      ? [[t.summary.breaks, t.summary.breaksValue(shortBreaks.length, formatDuration(shortBreaks.reduce((s, b) => s + b.endMs - b.startMs, 0) / 1000))] as [string, string]]
      : []),
    ...(days.length > 1
      ? days.map((d, k): [string, string] => [t.summary.day(k + 1), `${formatTime(d.startMs)}–${formatClock(d.endMs)} · ${formatKm(d.toM - d.fromM)}`])
      : []),
    // Via stops only: departure and destination are on the timetable row above.
    ...tl.legArrivalMs.slice(0, -1).map((ms, i): [string, string] => [t.summary.arrivalAt(stopTitles[i + 1]), formatTime(ms)]),
  ];
  if (roadSteps) {
    const b = roadBreakdown(roadSteps, ROAD_TYPE_RULES);
    const parts: [string, number][] = [
      [t.summary.road.motorway, b.motorway],
      [t.summary.road.primary, b.primary],
      [t.summary.road.urban, b.urban],
      [t.summary.road.ferry, b.ferry],
    ];
    rows.push([t.summary.roadType, parts.filter(([, m]) => m > 0).map(([n, m]) => `${n} ${formatKm(m)}`).join(" · ")]);
  }
  return rows;
}
