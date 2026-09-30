import { t } from "../i18n";
import { fromLngLat, type LatLon } from "../core/geo";
import { lineLength, makeLine } from "../core/route/line";
import { formatKm } from "./format";
import { icons } from "./icons";
import type { MapView } from "./map";

// "Mesafe ölç", as in Google Maps: each map click adds a point, points can be dragged, clicking a
// point removes it; a card shows the total. While active, map clicks belong to the tool.
export function createMeasure(map: MapView, card: HTMLElement) {
  const layer = map.overlay();
  let markers: ReturnType<MapView["marker"]>[] = [];
  let points: LatLon[] = [];
  let active = false;

  function draw() {
    layer.clear();
    markers.forEach((m) => m.remove());
    const line = points.length > 1 ? layer.line(points, "measure-line", 3) : null;
    markers = points.map((p, i) => {
      const node = document.createElement("div");
      node.className = "measure-point";
      node.style.width = node.style.height = "14px";
      node.addEventListener("click", () => {
        points.splice(i, 1);
        draw();
      });
      const m = map.marker(p, node, { draggable: true, z: map.Z.measure, title: t.measure.pointTitle }).addTo(map.gl);
      m.on("drag", () => {
        points[i] = fromLngLat(m.getLngLat());
        if (line) layer.move(line, points);
        text();
      });
      m.on("dragend", draw);
      return m;
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
    card.hidden = false;
    map.gl.getContainer().classList.add("measuring");
    draw();
  }

  function stop() {
    active = false;
    points = [];
    draw();
    card.hidden = true;
    map.gl.getContainer().classList.remove("measuring");
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
