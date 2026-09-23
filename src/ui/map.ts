import L from "leaflet";
import { fromLatLng, toLatLng, type LatLon } from "../core/geo";

export type StopKind = "start" | "via" | "end";

// OSM standard tiles, muted (and inverted at night) by CSS filters on the tile pane.
// Keyless muted basemaps (CARTO) now watermark browser requests without an API key.
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function createMap(el: HTMLElement, onClick: (p: LatLon) => void) {
  const map = L.map(el, { zoomControl: false }).setView([39, 35], 6);
  L.control.zoom({ position: "topright" }).addTo(map);
  map.attributionControl.setPrefix(false);

  L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);

  map.on("click", (e) => onClick(fromLatLng(e.latlng)));

  const routeLayer = L.layerGroup().addTo(map);
  const stopLayer = L.layerGroup().addTo(map);
  const breakLayer = L.layerGroup().addTo(map);

  const pin = (kind: StopKind) => {
    const size = kind === "via" ? 16 : 20;
    return L.divIcon({ className: "", html: `<span class="pin pin-${kind}" style="width:${size}px;height:${size}px"></span>`, iconSize: [size, size] });
  };

  return {
    leaflet: map,

    setStops(stops: { pos: LatLon; kind: StopKind }[]) {
      stopLayer.clearLayers();
      for (const s of stops) L.marker(toLatLng(s.pos), { icon: pin(s.kind), keyboard: false }).addTo(stopLayer);
    },

    setRoutes(routes: LatLon[][], selected: number, onRouteClick: (i: number, p: LatLon) => void) {
      routeLayer.clearLayers();
      // Alternatives first so the selected route stays on top; the selected one gets a casing.
      const order = routes.map((_, i) => i).sort((a, b) => Number(a === selected) - Number(b === selected));
      for (const i of order) {
        const latlngs = routes[i].map(toLatLng);
        const lines =
          i === selected
            ? [L.polyline(latlngs, { weight: 11, className: "route route-casing" }), L.polyline(latlngs, { weight: 6, className: "route route-selected" })]
            : [L.polyline(latlngs, { weight: 6, className: "route route-alt" })];
        for (const line of lines) {
          line.addTo(routeLayer).on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            onRouteClick(i, fromLatLng(e.latlng));
          });
        }
      }
    },

    // Draggable break markers that stay on the route while dragged.
    setBreaks(points: LatLon[], snap: (p: LatLon) => LatLon, onMove: (i: number, p: LatLon) => void) {
      breakLayer.clearLayers();
      points.forEach((p, i) => {
        const m = L.marker(toLatLng(p), {
          draggable: true,
          title: `Mola ${i + 1}`,
          icon: L.divIcon({ className: "break-marker", html: `${i + 1}`, iconSize: [24, 24] }),
        }).addTo(breakLayer);
        m.on("drag", () => m.setLatLng(toLatLng(snap(fromLatLng(m.getLatLng())))));
        m.on("dragend", () => onMove(i, fromLatLng(m.getLatLng())));
      });
    },

    // Fits the points into the part of the map the sheet does not cover.
    fit(points: LatLon[], insets: { left: number; bottom: number }) {
      if (!points.length) return;
      map.fitBounds(L.latLngBounds(points.map(toLatLng)), {
        paddingTopLeft: [insets.left + 32, 48],
        paddingBottomRight: [56, insets.bottom + 32],
      });
    },
  };
}
