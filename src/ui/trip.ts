import type { LatLon } from "../core/geo";
import type { Place } from "../services/photon";
import { icons } from "./icons";
import { placeInput } from "./search";

export interface TripStop {
  label: string;
  pos: LatLon | null;
}

export type StopKind = "start" | "via" | "end";

export const kindOf = (i: number, n: number): StopKind => (i === 0 ? "start" : i === n - 1 ? "end" : "via");
export const titleOf = (i: number, n: number) => ({ start: "Başlangıç", end: "Bitiş", via: `Ara durak ${i}` })[kindOf(i, n)];
const placeholderOf = (i: number, n: number) => ({ start: "Nereden?", end: "Nereye?", via: "Durak" })[kindOf(i, n)];

interface Handlers {
  onPick(i: number, p: Place): void;
  onRemove(i: number): void;
  onMove(from: number, to: number): void;
  onSwap(): void;
  near(): LatLon; // search bias
}

// Trip card rows, Google Maps style: the stop glyph is a drag handle (pointer or arrow keys),
// every row gets a remove button once there are more than two stops, two stops get a swap button.
export function renderTrip(el: HTMLElement, swap: HTMLButtonElement, stops: TripStop[], h: Handlers) {
  const n = stops.length;
  swap.hidden = n !== 2;
  el.replaceChildren(
    ...stops.map((s, i) => {
      const row = document.createElement("li");
      row.className = `stop-row stop-${kindOf(i, n)}`;
      const glyph = document.createElement("button");
      glyph.type = "button";
      glyph.className = "stop-glyph";
      glyph.setAttribute("aria-label", `${titleOf(i, n)}: sırayı değiştirmek için sürükle veya ok tuşlarını kullan`);
      glyph.addEventListener("keydown", (e) => {
        const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : -1;
        if (to < 0 || to >= n) return;
        e.preventDefault();
        h.onMove(i, to);
        el.querySelectorAll<HTMLElement>(".stop-glyph")[to]?.focus();
      });
      glyph.addEventListener("pointerdown", (e) => dragRow(el, i, e, h.onMove));
      row.append(glyph, placeInput(s.label, placeholderOf(i, n), `${titleOf(i, n)} adresi`, (p) => h.onPick(i, p), h.near));
      if (n > 2) {
        const rm = document.createElement("button");
        rm.type = "button";
        rm.className = "icon-btn";
        rm.innerHTML = icons.close;
        rm.setAttribute("aria-label", `${titleOf(i, n)} sil`);
        rm.title = "Durağı kaldır";
        rm.addEventListener("click", () => h.onRemove(i));
        row.append(rm);
      }
      return row;
    }),
  );
}

// Drags row `from` with the pointer; the other rows slide out of the way. Drops on release.
function dragRow(list: HTMLElement, from: number, e: PointerEvent, onMove: (from: number, to: number) => void) {
  if (e.button !== 0) return;
  const handle = e.currentTarget as HTMLElement;
  const rows = [...list.children] as HTMLElement[];
  if (rows.length < 2) return;
  const mids = rows.map((r) => {
    const b = r.getBoundingClientRect();
    return b.top + b.height / 2;
  });
  const height = rows[from].getBoundingClientRect().height;
  const startY = e.clientY;
  let to = from;
  let moved = false;
  try {
    handle.setPointerCapture(e.pointerId);
  } catch {
    // pointer already released; the window listeners below still end the drag
  }

  const move = (ev: PointerEvent) => {
    const dy = ev.clientY - startY;
    if (!moved && Math.abs(dy) < 4) return;
    if (!moved) list.classList.add("reordering");
    moved = true;
    const y = mids[from] + dy;
    to = mids.filter((m, j) => j !== from && m < y).length;
    rows.forEach((r, j) => {
      let shift = 0;
      if (j === from) shift = dy;
      else if (from < to && j > from && j <= to) shift = -height;
      else if (to < from && j >= to && j < from) shift = height;
      r.style.transform = shift ? `translateY(${shift}px)` : "";
    });
    rows[from].classList.add("dragging");
  };
  const end = () => {
    removeEventListener("pointermove", move);
    removeEventListener("pointerup", end);
    removeEventListener("pointercancel", end);
    list.classList.remove("reordering");
    for (const r of rows) {
      r.style.transform = "";
      r.classList.remove("dragging");
    }
    if (moved && to !== from) onMove(from, to);
  };
  addEventListener("pointermove", move);
  addEventListener("pointerup", end);
  addEventListener("pointercancel", end);
}
