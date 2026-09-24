import { t } from "../i18n";
import { GPX_TRACK_KMH } from "../config/vehicles";
import type { LatLon } from "../core/geo";
import { parseGpx, toGpx } from "../core/route/gpx";
import { lineLength, makeLine } from "../core/route/line";
import type { Route } from "../services/osrm";
import { formatKm } from "./format";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

interface Deps {
  status(text: string, kind?: "info" | "error"): void;
  // The track as a route; the caller makes its ends the stops and plans it.
  onImport(route: Route, ends: [LatLon, LatLon]): Promise<void>;
  // What to export: the selected route and the stop and break waypoints, or null without a route.
  exportData(): { route: Route; waypoints: { pos: LatLon; name: string }[]; first: string; last: string } | null;
}

// "Open a GPX file" and "Save GPX".
export function bindGpx(deps: Deps) {
  $<HTMLInputElement>("gpx-file").addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const gpx = parseGpx(await file.text());
    if (!gpx) return deps.status(t.gpx.noPoints, "error");
    // No road data in a track: the assumed speed only feeds the road type guess.
    const distanceM = lineLength(makeLine(gpx.points));
    const durationS = distanceM / (GPX_TRACK_KMH / 3.6);
    const route: Route = { coords: gpx.points, distanceM, durationS, steps: [{ distanceM, durationS, ref: "", ferry: false, leg: 0 }] };
    await deps.onImport(route, [gpx.points[0], gpx.points[gpx.points.length - 1]]);
    deps.status(t.gpx.loaded(gpx.name, formatKm(distanceM), gpx.points.length));
  });
  $("gpx-import").addEventListener("click", () => $("gpx-file").click());

  $("gpx-export").addEventListener("click", () => {
    const data = deps.exportData();
    if (!data) return;
    const xml = toGpx(`${data.first} → ${data.last}`, data.route.coords, data.waypoints);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([xml], { type: "application/gpx+xml" }));
    a.download = `ridecast-${slug(data.first)}-${slug(data.last)}.gpx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}

// File-name safe ASCII: Turkish letters folded, other characters dropped.
const slug = (s: string) =>
  s
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (ch) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[ch]!)
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "rota";
