import "leaflet/dist/leaflet.css";
import "./style.css";
import { lang, setLang, translatePage, type Lang } from "./i18n";
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

bindTheme(document.getElementById("theme")!);
startApp();

// Offline shell and last trip data (public/sw.js). Not in dev, where Vite serves unbundled files.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  addEventListener("load", () => void navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
