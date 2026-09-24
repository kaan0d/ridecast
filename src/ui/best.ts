import { t } from "../i18n";
import { DEPARTURE } from "../config/departure";
import { RISK_WEIGHTS } from "../config/risk";
import { WEATHER_REQUEST } from "../config/weather";
import type { ScoredDeparture } from "../core/advice/departure";
import { scoreOf100 } from "../core/risk/route";
import { formatClock, formatTime } from "./format";

export type BestWindow = "day" | "week";

// "Best time": over the next 24 hours the top departures, over the next 7 days the best one of each
// day; each with arrival and risk. Tapping one re-plans for it.
export function renderBest(
  el: HTMLElement,
  state: { top: ScoredDeparture[]; loading: boolean; error?: string; window: BestWindow },
  chosenMs: number | null,
  onPick: (departMs: number) => void,
  onWindow: (w: BestWindow) => void,
) {
  const tabs = document.createElement("div");
  tabs.className = "best-window";
  tabs.setAttribute("role", "group");
  for (const [w, label] of [
    ["day", t.best.windowDay],
    ["week", t.best.windowWeek],
  ] as [BestWindow, string][]) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-pressed", String(state.window === w));
    b.addEventListener("click", () => w !== state.window && onWindow(w));
    tabs.append(b);
  }
  const week = state.window === "week";

  if (state.error || state.loading || !state.top.length) {
    const p = document.createElement("p");
    p.className = "footnote";
    p.textContent = state.error ?? (state.loading ? (week ? t.best.comparingWeek : t.best.comparing) : t.best.needRoute);
    return el.replaceChildren(tabs, p);
  }
  const list = document.createElement("ol");
  list.className = "best-list";
  const far = Date.now() + WEATHER_REQUEST.farDays * 86_400_000;
  for (const d of state.top) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "best-item";
    b.classList.toggle("far", d.departMs > far); // uncertain forecast, drawn dashed
    b.setAttribute("aria-pressed", String(chosenMs === d.departMs));
    const score = scoreOf100(d.score.score, RISK_WEIGHTS);
    b.innerHTML = `<span class="best-time">${formatTime(d.departMs)}</span><span class="best-meta"><span class="risk-dot risk-${d.score.worst}" aria-hidden="true"></span>${t.best.meta(formatClock(d.arrivalMs), score)}</span>`;
    b.addEventListener("click", () => onPick(d.departMs));
    li.append(b);
    list.append(li);
  }
  const note = document.createElement("p");
  note.className = "footnote";
  note.textContent = week ? t.best.noteWeek(DEPARTURE.weekDays, WEATHER_REQUEST.farDays) : t.best.note(DEPARTURE.windowH, state.top.length);
  el.replaceChildren(tabs, list, note);
}
