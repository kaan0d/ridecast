import type { LatLon } from "../core/geo";
import { searchPlaces, type Place } from "../services/photon";

const DEBOUNCE_MS = 350;
const MIN_QUERY = 3;

// Address input with Photon suggestions, biased towards `near` (the map centre). Searches after a
// short pause in typing; arrow keys move through the suggestions, Enter takes the first or focused one.
export function placeInput(value: string, placeholder: string, label: string, onPick: (p: Place) => void, near?: () => LatLon): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "place-input";
  const input = document.createElement("input");
  input.type = "search";
  input.value = value;
  input.placeholder = placeholder;
  input.setAttribute("aria-label", label);
  input.autocomplete = "off";
  const list = document.createElement("ul");
  list.className = "suggestions";
  wrap.append(input, list);

  let timer: number | undefined;
  let seq = 0;
  const note = (text: string, cls = "") => {
    const li = document.createElement("li");
    li.className = `note ${cls}`;
    li.textContent = text;
    list.replaceChildren(li);
  };
  const close = () => {
    seq++;
    clearTimeout(timer);
    list.replaceChildren();
  };

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < MIN_QUERY) return close();
    timer = window.setTimeout(async () => {
      const my = ++seq;
      note("Aranıyor…");
      try {
        const places = await searchPlaces(q, near?.());
        if (my !== seq) return;
        if (!places.length) return note("Sonuç yok.");
        list.replaceChildren(
          ...places.map((p) => {
            const li = document.createElement("li");
            const b = document.createElement("button");
            b.type = "button";
            b.textContent = p.label;
            b.addEventListener("click", () => {
              close();
              input.value = p.label;
              onPick(p);
            });
            li.append(b);
            return li;
          }),
        );
      } catch (e) {
        if (my === seq) note((e as Error).message, "error");
      }
    }, DEBOUNCE_MS);
  });
  const options = () => [...list.querySelectorAll<HTMLButtonElement>("button")];
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
    else if (e.key === "Enter" && options().length) {
      e.preventDefault();
      options()[0].click();
    } else if (e.key === "ArrowDown" && options().length) {
      e.preventDefault();
      options()[0].focus();
    }
  });
  list.addEventListener("keydown", (e) => {
    const all = options();
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    if (e.key === "ArrowDown") all[Math.min(all.length - 1, i + 1)].focus();
    else if (e.key === "ArrowUp") (i === 0 ? input : all[i - 1]).focus();
    else if (e.key === "Escape") {
      close();
      input.focus();
    } else return;
    e.preventDefault();
  });
  wrap.addEventListener("focusout", (e) => {
    if (!wrap.contains(e.relatedTarget as Node | null)) close();
  });
  return wrap;
}
