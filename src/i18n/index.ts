import { en, type Messages } from "./en";
import { tr } from "./tr";
import { units, unitsOf } from "./units";

export type Lang = "en" | "tr";

const KEY = "ridecast.lang";

// English unless the viewer chose Turkish before (a per-browser choice).
function stored(): Lang {
  try {
    return localStorage.getItem(KEY) === "tr" ? "tr" : "en";
  } catch {
    return "en";
  }
}

export const lang: Lang = stored();
export const t: Messages = lang === "tr" ? tr : en;
// Display units for UI code; the texts above use the same choice.
export const u = unitsOf(units, t.kmh);
export { setUnits, units } from "./units";

// The trip lives in the URL hash, so a reload keeps it while every text is built again.
export function setLang(l: Lang) {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    // not remembered: the reload shows English again
  }
  location.reload();
}

// Static texts of index.html: English is in the page; other languages replace them by data-t keys.
export function translatePage(root: ParentNode = document) {
  document.documentElement.lang = lang;
  document.title = t.app.title;
  // Unit labels next to inputs follow the unit choice (after the texts, which name metric units).
  const unitLabels = () =>
    root.querySelectorAll<HTMLElement>("[data-unit]").forEach((el) => {
      if (units === "imperial") el.textContent = el.dataset.unit === "speed" ? u.speedUnit : u.distUnit;
    });
  if (lang === "en") return unitLabels();
  const text = (key: string | undefined) => (key ? t.html[key] : undefined);
  root.querySelectorAll<HTMLElement>("[data-t]").forEach((el) => {
    const v = text(el.dataset.t);
    if (v) el.textContent = v;
  });
  root.querySelectorAll<HTMLElement>("[data-t-aria]").forEach((el) => {
    const v = text(el.dataset.tAria);
    if (v) el.setAttribute("aria-label", v);
  });
  root.querySelectorAll<HTMLElement>("[data-t-title]").forEach((el) => {
    const v = text(el.dataset.tTitle);
    if (v) el.title = v;
  });
  unitLabels();
}
