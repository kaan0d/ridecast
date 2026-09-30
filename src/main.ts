import "@fontsource-variable/geist";
import "maplibre-gl/dist/maplibre-gl.css"; // before ours, which override it
import "./style.css";
import { lang, setLang, setUnits, translatePage, units, type Lang } from "./i18n";
import type { Units } from "./i18n/units";
import { startApp } from "./ui/app";
import { bindTheme } from "./ui/theme";

translatePage();

// Language radios on the settings page; a choice reloads the page (the trip stays in the URL).
const langGroup = document.getElementById("lang")!;
langGroup.querySelector<HTMLInputElement>(`input[value="${lang}"]`)!.checked = true;
langGroup.addEventListener("input", (e) => {
  e.stopPropagation(); // not a trip setting: the settings form would plan again
  setLang((e.target as HTMLInputElement).value as Lang);
});
const unitsGroup = document.getElementById("units")!;
unitsGroup.querySelector<HTMLInputElement>(`input[value="${units}"]`)!.checked = true;
unitsGroup.addEventListener("input", (e) => {
  e.stopPropagation();
  setUnits((e.target as HTMLInputElement).value as Units);
});

bindTheme(document.getElementById("theme")!);
startApp();

// Offline shell and last trip data (public/sw.js). Not in dev, where Vite serves unbundled files.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  addEventListener("load", () => void navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
