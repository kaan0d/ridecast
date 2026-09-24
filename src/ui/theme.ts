type Choice = "system" | "light" | "dark";

const KEY = "ridecast.theme";
const systemDark = matchMedia("(prefers-color-scheme: dark)");

let choice: Choice = stored();
let forcedLight = false; // sunlight mode while riding: light whatever the choice

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
}

// System / light / dark radios on the settings page, remembered per browser.
// index.html sets the first theme before paint; this keeps "system" following the device.
export function bindTheme(group: HTMLElement) {
  group.querySelector<HTMLInputElement>(`input[value="${choice}"]`)!.checked = true;
  systemDark.addEventListener("change", apply);
  group.addEventListener("input", (e) => {
    e.stopPropagation(); // not a trip setting: the settings form would plan again
    choice = (e.target as HTMLInputElement).value as Choice;
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
