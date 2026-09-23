import type { StopOnRoute } from "../core/advice/stops";
import { formatClock } from "./format";
import { icons } from "./icons";

const KIND = { fuel: "Akaryakıt", services: "Dinlenme tesisi", rest: "Mola yeri" };

export const stopIcon = (s: StopOnRoute) => (s.kind === "fuel" ? icons.fuel : icons.rest);

export function stopPin(s: StopOnRoute): string {
  return `<span class="stop-pin${s.recommended ? " recommended" : ""}">${stopIcon(s)}</span>`;
}

// List of stops along the route, each with an "add as break" action.
export function renderStops(
  el: HTMLElement,
  state: { stops: StopOnRoute[] | null; loading: boolean; error?: string; etaAt(distM: number): number | null; onLoad(): void; onAdd(s: StopOnRoute): void; onOpen(i: number): void },
) {
  const parts: HTMLElement[] = [];
  if (!state.stops) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "button-secondary stops-load";
    b.textContent = state.loading ? "Aranıyor…" : "Yakıt ve mola noktalarını göster";
    b.disabled = state.loading;
    b.addEventListener("click", state.onLoad);
    parts.push(b);
  }
  if (state.error) {
    const p = document.createElement("p");
    p.className = "footnote error-text";
    p.textContent = state.error;
    parts.push(p);
  }
  if (state.stops) {
    const list = document.createElement("ol");
    list.className = "stop-list";
    if (!state.stops.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "Rota boyunca 1 km içinde yakıt veya mola noktası bulunamadı.";
      list.append(li);
    }
    state.stops.forEach((s, i) => {
      const li = document.createElement("li");
      const open = document.createElement("button");
      open.type = "button";
      open.className = "stop-open";
      const eta = state.etaAt(s.distM);
      open.innerHTML = `${stopIcon(s)}<span class="stop-name"></span><span class="stop-meta"></span>`;
      open.querySelector(".stop-name")!.textContent = s.name;
      open.querySelector(".stop-meta")!.textContent =
        `${s.named ? KIND[s.kind] + " · " : ""}km ${Math.round(s.distM / 1000)}${eta ? " · " + formatClock(eta) : ""}${s.recommended ? " · barınaklı, yağış/soğukta önerilir" : ""}`;
      open.addEventListener("click", () => state.onOpen(i));
      const add = document.createElement("button");
      add.type = "button";
      add.className = "icon-btn";
      add.innerHTML = icons.plus;
      add.setAttribute("aria-label", `${s.name}: mola ekle`);
      add.title = "Mola ekle";
      add.addEventListener("click", () => state.onAdd(s));
      li.classList.toggle("recommended", s.recommended);
      li.append(open, add);
      list.append(li);
    });
    parts.push(list);
    const note = document.createElement("p");
    note.className = "footnote";
    note.textContent = "OpenStreetMap verisi, rotanın 1 km yakını. Aynı türden noktalar 10 km'de bire seyreltildi; yağış ve soğukta sadece barınaklı olanlar.";
    parts.push(note);
  }
  el.replaceChildren(...parts);
}
