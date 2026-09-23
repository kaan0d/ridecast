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
  const riskLayer = L.layerGroup().addTo(map);
  const stopLayer = L.layerGroup().addTo(map);
  const weatherLayer = L.layerGroup().addTo(map);
  const breakLayer = L.layerGroup().addTo(map);
  let weatherMarkers: L.Marker[] = [];

  // Shows only capsules that do not overlap the previous shown one, so the route stays visible
  // when zoomed out. The arrival point always shows.
  const MIN_GAP_PX = 64;
  function thinWeather() {
    weatherLayer.clearLayers();
    let last: L.Point | null = null;
    weatherMarkers.forEach((m, i) => {
      const p = map.latLngToContainerPoint(m.getLatLng());
      const isLast = i === weatherMarkers.length - 1;
      if (last && p.distanceTo(last) < MIN_GAP_PX && !isLast) return;
      m.addTo(weatherLayer);
      last = p;
    });
  }
  map.on("zoomend", thinWeather);

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

    // Risk colours over the selected route and a dotted pattern on dark parts. Not clickable,
    // so a click still reaches the route below (adds a break).
    setRisk(segments: { coords: LatLon[]; level: number }[], night: LatLon[][]) {
      riskLayer.clearLayers();
      for (const s of segments) {
        if (s.level > 0) L.polyline(s.coords.map(toLatLng), { weight: 6, interactive: false, className: `route route-risk-${s.level}` }).addTo(riskLayer);
      }
      for (const n of night) L.polyline(n.map(toLatLng), { weight: 3, interactive: false, className: "route route-night" }).addTo(riskLayer);
    },

    // Weather capsules with a card popup each.
    setWeather(points: { pos: LatLon; pin: string; card: string }[]) {
      weatherMarkers = points.map((p) =>
        L.marker(toLatLng(p.pos), { icon: L.divIcon({ className: "wx-marker", html: p.pin, iconSize: undefined }), keyboard: false }).bindPopup(
          p.card,
          { className: "wx-popup", closeButton: false, offset: [0, -8], maxWidth: 280, minWidth: 240 },
        ),
      );
      thinWeather();
    },

    openWeather(i: number) {
      const m = weatherMarkers[i];
      if (!m) return;
      m.addTo(weatherLayer); // may be thinned out at this zoom
      map.panTo(m.getLatLng());
      m.openPopup();
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
