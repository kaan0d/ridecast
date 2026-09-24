import type { LatLon } from "../core/geo";
import { reverseLabel } from "../services/nominatim";
import { formatCoord } from "./format";

export interface PlaceAction {
  label: string;
  primary?: boolean;
  run(): void;
}

// Card for a dropped pin: address (looked up), coordinates, and the trip actions.
export function placeCard(pos: LatLon, actions: PlaceAction[]): HTMLElement {
  const card = document.createElement("div");
  card.className = "place-card";
  const title = document.createElement("strong");
  title.textContent = "Seçilen nokta";
  const addr = document.createElement("span");
  addr.className = "place-addr";
  addr.textContent = "Adres aranıyor…";
  const coord = document.createElement("span");
  coord.className = "place-coord";
  coord.textContent = formatCoord(pos);
  const row = document.createElement("div");
  row.className = "place-actions";
  for (const a of actions) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = a.primary ? "button-primary" : "button-secondary";
    b.textContent = a.label;
    b.addEventListener("click", a.run);
    row.append(b);
  }
  card.append(title, addr, coord, row);
  void reverseLabel(pos).then((label) => {
    if (!label) return (addr.textContent = "Bu nokta için adres yok.");
    const [first, ...rest] = label.split(", ");
    title.textContent = first;
    addr.textContent = rest.slice(0, 3).join(", ");
  });
  return card;
}
