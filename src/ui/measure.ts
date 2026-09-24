import { t } from "../i18n";
import L from "leaflet";
import { fromLatLng, toLatLng, type LatLon } from "../core/geo";
import { lineLength, makeLine } from "../core/route/line";
import { formatKm } from "./format";
import { icons } from "./icons";

// "Mesafe ölç", as in Google Maps: each map click adds a point, points can be dragged, clicking a
// point removes it; a card shows the total. While active, map clicks belong to the tool.
export function createMeasure(map: L.Map, card: HTMLElement) {
  const layer = L.layerGroup();
  let points: LatLon[] = [];
  let active = false;

  function draw() {
    layer.clearLayers();
    if (points.length > 1) L.polyline(points.map(toLatLng), { weight: 3, className: "measure-line", interactive: false }).addTo(layer);
    points.forEach((p, i) => {
      const m = L.marker(toLatLng(p), {
        icon: L.divIcon({ className: "measure-point", iconSize: [14, 14] }),
        draggable: true,
        title: t.measure.pointTitle,
        zIndexOffset: 1200,
      }).addTo(layer);
      m.on("drag", () => {
        points[i] = fromLatLng(m.getLatLng());
        const line = layer.getLayers().find((l) => l instanceof L.Polyline) as L.Polyline | undefined;
        line?.setLatLngs(points.map(toLatLng));
        text();
      });
      m.on("dragend", draw);
      m.on("click", () => {
        points.splice(i, 1);
        draw();
      });
    });
    text();
  }

  function text() {
    const total = points.length > 1 ? lineLength(makeLine(points)) : 0;
    card.querySelector(".measure-total")!.textContent = points.length > 1 ? formatKm(total) : t.measure.hint;
    card.querySelector(".measure-count")!.textContent = t.measure.count(points.length);
  }

  function start(p: LatLon) {
    active = true;
    points = [p];
    layer.addTo(map);
    card.hidden = false;
    map.getContainer().classList.add("measuring");
    draw();
  }

  function stop() {
    active = false;
    points = [];
    layer.remove();
    card.hidden = true;
    map.getContainer().classList.remove("measuring");
  }

  card.querySelector(".measure-clear")!.addEventListener("click", () => {
    points = points.slice(0, 1);
    draw();
  });
  const close = card.querySelector(".measure-close")!;
  close.innerHTML = icons.close;
  close.addEventListener("click", stop);

  return {
    start,
    stop,
    isActive: () => active,
    add(p: LatLon) {
      points.push(p);
      draw();
    },
  };
}
