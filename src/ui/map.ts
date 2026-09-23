import L from "leaflet";
import { fromLatLng, toLatLng, type LatLon } from "../core/geo";

export type StopKind = "start" | "via" | "end";

export function createMap(el: HTMLElement, onClick: (p: LatLon) => void) {
  const map = L.map(el).setView([39, 35], 6);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  map.on("click", (e) => onClick(fromLatLng(e.latlng)));

  const routeLayer = L.layerGroup().addTo(map);
  const stopLayer = L.layerGroup().addTo(map);
  const breakLayer = L.layerGroup().addTo(map);

  return {
    setStops(stops: { pos: LatLon; kind: StopKind }[]) {
      stopLayer.clearLayers();
      for (const s of stops) {
        L.circleMarker(toLatLng(s.pos), { radius: 8, className: `stop-marker stop-${s.kind}` }).addTo(stopLayer);
      }
    },

    setRoutes(routes: LatLon[][], selected: number, onRouteClick: (i: number, p: LatLon) => void) {
      routeLayer.clearLayers();
      // Draw alternatives first so the selected route stays on top.
      const order = routes.map((_, i) => i).sort((a, b) => Number(a === selected) - Number(b === selected));
      for (const i of order) {
        const line = L.polyline(routes[i].map(toLatLng), {
          weight: i === selected ? 7 : 5,
          className: i === selected ? "route route-selected" : "route route-alt",
        }).addTo(routeLayer);
        line.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          onRouteClick(i, fromLatLng(e.latlng));
        });
      }
    },

    // Draggable break markers that stay on the route while dragged.
    setBreaks(points: LatLon[], snap: (p: LatLon) => LatLon, onMove: (i: number, p: LatLon) => void) {
      breakLayer.clearLayers();
      points.forEach((p, i) => {
        const m = L.marker(toLatLng(p), {
          draggable: true,
          title: `Mola ${i + 1}`,
          icon: L.divIcon({ className: "break-marker", html: `<span>${i + 1}</span>`, iconSize: [24, 24] }),
        }).addTo(breakLayer);
        m.on("drag", () => m.setLatLng(toLatLng(snap(fromLatLng(m.getLatLng())))));
        m.on("dragend", () => onMove(i, fromLatLng(m.getLatLng())));
      });
    },

    fit(points: LatLon[]) {
      if (points.length) map.fitBounds(L.latLngBounds(points.map(toLatLng)), { padding: [30, 30] });
    },
  };
}
