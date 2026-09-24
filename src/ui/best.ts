import { dec1, t } from "../i18n";
import { DEPARTURE } from "../config/departure";
import type { ScoredDeparture } from "../core/advice/departure";
import { formatClock, formatTime } from "./format";

// "Best time": the top departures with arrival and risk; tapping one re-plans for it.
export function renderBest(
  el: HTMLElement,
  state: { top: ScoredDeparture[]; loading: boolean; error?: string },
  chosenMs: number | null,
  onPick: (departMs: number) => void,
) {
  if (state.error || state.loading || !state.top.length) {
    const p = document.createElement("p");
    p.className = "footnote";
    p.textContent = state.error ?? (state.loading ? t.best.comparing : t.best.needRoute);
    return el.replaceChildren(p);
  }
  const list = document.createElement("ol");
  list.className = "best-list";
  for (const d of state.top) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "best-item";
    b.setAttribute("aria-pressed", String(chosenMs === d.departMs));
    const score = dec1(d.score.score);
    b.innerHTML = `<span class="best-time">${formatTime(d.departMs)}</span><span class="best-meta"><span class="risk-dot risk-${d.score.worst}" aria-hidden="true"></span>${t.best.meta(formatClock(d.arrivalMs), score)}</span>`;
    b.addEventListener("click", () => onPick(d.departMs));
    li.append(b);
    list.append(li);
  }
  const note = document.createElement("p");
  note.className = "footnote";
  note.textContent = t.best.note(DEPARTURE.windowH, state.top.length);
  el.replaceChildren(list, note);
}
