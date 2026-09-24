import "leaflet/dist/leaflet.css";
import "./style.css";
import { lang, setLang, t, translatePage, type Lang } from "./i18n";
import { startApp } from "./ui/app";

translatePage();

// EN / TR switch in the panel header; a choice reloads the page (the trip stays in the URL).
const langSwitch = document.getElementById("lang")!;
langSwitch.setAttribute("aria-label", t.lang.label);
for (const l of ["en", "tr"] as Lang[]) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = t.lang[l];
  b.lang = l;
  b.setAttribute("aria-pressed", String(l === lang));
  b.addEventListener("click", () => l !== lang && setLang(l));
  langSwitch.append(b);
}

startApp();

// Offline shell and last trip data (public/sw.js). Not in dev, where Vite serves unbundled files.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  addEventListener("load", () => void navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
