import { t } from "../i18n";
import type { LatLon } from "../core/geo";
import { searchPlaces, type Place } from "../services/photon";

const DEBOUNCE_MS = 350;
const MIN_QUERY = 3;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

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
  let shown = value; // the text before this input event, for the clear animation
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
    if (!input.value && shown.length > 1) dissolve(wrap, input, shown);
    else if (input.value) wrap.querySelector(".clear-placeholder")?.remove();
    shown = input.value;
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < MIN_QUERY) return close();
    timer = window.setTimeout(async () => {
      const my = ++seq;
      note(t.trip.searching);
      try {
        const places = await searchPlaces(q, near?.());
        if (my !== seq) return;
        if (!places.length) return note(t.trip.noResults);
        list.replaceChildren(
          ...places.map((p) => {
            const li = document.createElement("li");
            const b = document.createElement("button");
            b.type = "button";
            b.textContent = p.label;
            b.addEventListener("click", () => {
              close();
              input.value = shown = p.label;
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

// A cleared field (the x, Escape, or all text deleted at once): the old words rise and blur away,
// each over a short streak, while the placeholder rises in. Overlays only; the input is already empty.
function dissolve(wrap: HTMLElement, input: HTMLInputElement, text: string) {
  if (reducedMotion.matches) return;
  wrap.querySelectorAll(".clear-layer").forEach((el) => el.remove());
  const layer = (cls: string) => {
    const el = document.createElement("div");
    el.className = `clear-layer ${cls}`;
    el.setAttribute("aria-hidden", "true");
    return el;
  };
  const ghost = layer("clear-ghost");
  ghost.append(
    ...text.split(/(\s+)/).map((w) => {
      const span = document.createElement("span");
      span.textContent = w;
      return span;
    }),
  );
  const holder = layer("clear-placeholder");
  holder.textContent = input.placeholder;
  const glow = layer("clear-glow");
  wrap.append(ghost, holder, glow);
  input.classList.add("clearing");

  const box = wrap.getBoundingClientRect();
  glow.style.backgroundImage = [...ghost.children]
    .map((w) => w.getBoundingClientRect())
    .filter((r, i) => ghost.children[i].textContent!.trim() && r.left < box.right)
    .map((r) => `radial-gradient(${r.width * 0.75}px ${r.height}px at ${r.left - box.left + r.width / 2}px ${r.top - box.top + r.height / 2}px, var(--clear-streak), transparent)`)
    .join(",");

  const off = { transform: "translateY(-12px)", opacity: 0, filter: "blur(2px)" };
  ghost.animate([{}, off], { duration: 400, easing: EASE, fill: "forwards" });
  holder.animate([{ ...off, transform: "translateY(12px)" }, {}], { duration: 400, easing: EASE });
  glow
    .animate([{ opacity: 0 }, { opacity: 0.85, offset: 0.15 }, { opacity: 0 }], { duration: 1000, delay: 50 })
    .finished.then(() => {
      for (const el of [ghost, holder, glow]) el.remove();
      if (!wrap.querySelector(".clear-layer")) input.classList.remove("clearing");
    });
}
