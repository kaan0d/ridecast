import { searchPlaces, type Place } from "../services/nominatim";

const DEBOUNCE_MS = 600;
const MIN_QUERY = 3;

// Address input with Nominatim suggestions. Searches only after the user stops typing.
export function placeInput(value: string, placeholder: string, onPick: (p: Place) => void): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "place-input";
  const input = document.createElement("input");
  input.type = "search";
  input.value = value;
  input.placeholder = placeholder;
  input.setAttribute("aria-label", placeholder);
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
        const places = await searchPlaces(q);
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
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  wrap.addEventListener("focusout", (e) => {
    if (!wrap.contains(e.relatedTarget as Node | null)) close();
  });
  return wrap;
}
