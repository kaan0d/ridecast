import "leaflet/dist/leaflet.css";
import "./style.css";
import { startApp } from "./ui/app";

startApp();

// Offline shell and last trip data (public/sw.js). Not in dev, where Vite serves unbundled files.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  addEventListener("load", () => void navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
