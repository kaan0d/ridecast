import { DEPARTURE } from "../config/departure";
import type { ScoredDeparture } from "../core/advice/departure";
import { formatClock, formatTime } from "./format";

// "En iyi saat": the top departures with arrival and risk; tapping one re-plans for it.
export function renderBest(
  el: HTMLElement,
  state: { top: ScoredDeparture[]; loading: boolean; error?: string },
  chosenMs: number | null,
  onPick: (departMs: number) => void,
) {
  if (state.error || state.loading || !state.top.length) {
    const p = document.createElement("p");
    p.className = "footnote";
    p.textContent = state.error ?? (state.loading ? "Önümüzdeki 24 saat karşılaştırılıyor…" : "Karşılaştırma için önce bir rota oluşturun.");
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
    const score = d.score.score.toFixed(1).replace(".", ",");
    b.innerHTML = `<span class="best-time">${formatTime(d.departMs)}</span><span class="best-meta"><span class="risk-dot risk-${d.score.worst}" aria-hidden="true"></span>varış ${formatClock(d.arrivalMs)} · risk ${score}</span>`;
    b.addEventListener("click", () => onPick(d.departMs));
    li.append(b);
    list.append(li);
  }
  const note = document.createElement("p");
  note.className = "footnote";
  note.textContent = `Önümüzdeki ${DEPARTURE.windowH} saat, saat başı adaylar arasından en düşük riskli ${state.top.length} çıkış.`;
  el.replaceChildren(list, note);
}
