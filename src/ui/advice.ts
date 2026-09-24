import { t } from "../i18n";
import { CLOTHING } from "../config/clothing";
import type { VehicleType } from "../config/vehicles";
import { clothingFor, summarize } from "../core/advice/clothing";
import type { WeatherPoint } from "./weather";

// "Giyim önerisi": the clothing table checked against the worst conditions on the route.
export function renderClothing(el: HTMLElement, points: WeatherPoint[], vehicle: VehicleType) {
  const conditions = summarize(points);
  if (!conditions) return el.replaceChildren();
  const items = clothingFor(conditions, vehicle, CLOTHING, t.clothing.why);
  const title = document.createElement("h2");
  title.className = "group-title";
  title.textContent = t.clothing.title;
  const list = document.createElement("ul");
  list.className = "group advice-list";
  if (!items.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = t.clothing.nothing;
    list.append(li);
  }
  for (const i of items) {
    const li = document.createElement("li");
    const item = document.createElement("span");
    item.className = "advice-item";
    item.textContent = t.clothing.items[i.item] ?? i.item;
    const why = document.createElement("span");
    why.className = "advice-why";
    why.textContent = i.why;
    li.append(item, why);
    list.append(li);
  }
  el.replaceChildren(title, list);
}
