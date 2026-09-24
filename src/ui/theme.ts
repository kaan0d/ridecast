import { t } from "../i18n";
import { icons } from "./icons";

type Choice = "system" | "light" | "dark";

const KEY = "ridecast.theme";
const ORDER: Choice[] = ["system", "light", "dark"];
const systemDark = matchMedia("(prefers-color-scheme: dark)");

let choice: Choice = stored();
let forcedLight = false; // sunlight mode while riding: light whatever the choice
let button: HTMLElement | null = null;

function stored(): Choice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply() {
  const root = document.documentElement;
  root.dataset.theme = forcedLight ? "light" : choice === "system" ? (systemDark.matches ? "dark" : "light") : choice;
  const ground = getComputedStyle(root).getPropertyValue("--ground").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", ground);
  if (!button) return;
  button.innerHTML = choice === "system" ? icons.auto : choice === "light" ? icons.sun : icons.moon;
  button.setAttribute("aria-label", t.theme[choice]);
  button.title = t.theme[choice];
}

// Theme button in the panel header: system, light, dark in turn, remembered per browser.
// index.html sets the first theme before paint; this keeps "system" following the device.
export function bindTheme(el: HTMLElement) {
  button = el;
  systemDark.addEventListener("change", apply);
  el.addEventListener("click", () => {
    choice = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
    try {
      if (choice === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, choice);
    } catch {
      // not remembered: the next visit follows the system
    }
    apply();
  });
  apply();
}

// Light theme (white map) while on, the chosen theme again when off. Not remembered.
export function forceLight(on: boolean) {
  if (on === forcedLight) return;
  forcedLight = on;
  apply();
}
