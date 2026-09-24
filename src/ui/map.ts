import L from "leaflet";
import { fromLatLng, toLatLng, type LatLon } from "../core/geo";

import { icons } from "./icons";
import type { StopKind } from "./trip";

// Base tiles come from ui/layers.ts (OSM muted by CSS, satellite, terrain).

interface MapHandlers {
  onClick(p: LatLon): void;
  onContext(p: LatLon, x: number, y: number): void; // right click or long press, screen point
  onMoveStart(): void;
  onLocate(): void;
  onRouteDrag(i: number, grab: LatLon, drop: LatLon): void; // a route line dragged to a new point
}

// A map button in a Leaflet corner, styled like the zoom buttons.
function mapButton(position: L.ControlPosition, html: string, label: string, onClick: (b: HTMLButtonElement) => void, id?: string) {
  const Ctl = L.Control.extend({
    onAdd() {
      const b = L.DomUtil.create("button", "map-btn");
      b.type = "button";
      b.innerHTML = html;
      b.setAttribute("aria-label", label);
      b.title = label;
      if (id) b.id = id;
      L.DomEvent.disableClickPropagation(b);
      b.addEventListener("click", () => onClick(b));
      return b;
    },
  });
  return new Ctl({ position });
}

export function createMap(el: HTMLElement, h: MapHandlers) {
  const map = L.map(el, { zoomControl: false }).setView([39, 35], 6);
  map.attributionControl.setPrefix(false);
  // Bottom-right stack like Google Maps: scale, zoom, then "my location" on top.
  L.control.scale({ position: "bottomright", imperial: false }).addTo(map);
  L.control.zoom({ position: "bottomright", zoomInTitle: "Yakınlaştır", zoomOutTitle: "Uzaklaştır" }).addTo(map);
  mapButton("bottomright", icons.locate, "Konumumu göster", () => h.onLocate(), "locate").addTo(map);
  mapButton("topright", icons.layers, "Katmanlar", () => {}, "layers").addTo(map);

  // Dragging a route line (mouse) drops a via point where it is released, like Google Maps.
  // A press without movement stays a click (select the route or add a break).
  let routeDragged = false;
  function startRouteDrag(i: number, e: L.LeafletMouseEvent) {
    if (e.originalEvent.button !== 0 || (e.originalEvent as PointerEvent).pointerType === "touch") return;
    const grab = e.latlng;
    const start = e.containerPoint;
    let ghost: L.CircleMarker | null = null;
    map.dragging.disable();
    const move = (ev: L.LeafletMouseEvent) => {
      if (!ghost && ev.containerPoint.distanceTo(start) < 6) return;
      if (!ghost) ghost = L.circleMarker(ev.latlng, { radius: 7, className: "route-drag-ghost", interactive: false }).addTo(map);
      ghost.setLatLng(ev.latlng);
    };
    const up = () => {
      map.off("mousemove", move);
      removeEventListener("mouseup", up);
      map.dragging.enable();
      if (!ghost) return;
      const drop = ghost.getLatLng();
      ghost.remove();
      routeDragged = true;
      setTimeout(() => (routeDragged = false), 0);
      h.onRouteDrag(i, fromLatLng(grab), fromLatLng(drop));
    };
    map.on("mousemove", move);
    addEventListener("mouseup", up);
  }

  map.on("click", (e) => h.onClick(fromLatLng(e.latlng)));
  map.on("contextmenu", (e) => {
    e.originalEvent.preventDefault();
    h.onContext(fromLatLng(e.latlng), e.originalEvent.clientX, e.originalEvent.clientY);
  });
  map.on("movestart zoomstart", () => h.onMoveStart());

  const routeLayer = L.layerGroup().addTo(map);
  const riskLayer = L.layerGroup().addTo(map);
  const stopLayer = L.layerGroup().addTo(map);
  const weatherLayer = L.layerGroup().addTo(map);
  const poiLayer = L.layerGroup().addTo(map);
  const labelLayer = L.layerGroup().addTo(map);
  let dropped: L.CircleMarker | null = null;
  const breakLayer = L.layerGroup().addTo(map);
  let poiMarkers: L.Marker[] = [];
  let liveDot: L.CircleMarker | null = null;
  let meDot: L.CircleMarker | null = null;
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
    const size = kind === "via" ? 18 : 22;
    return L.divIcon({ className: "stop-marker", html: `<span class="pin pin-${kind}" style="width:${size}px;height:${size}px"></span>`, iconSize: [size, size] });
  };

  return {
    leaflet: map,

    center: () => fromLatLng(map.getCenter()),

    // Stop pins; dragging one moves that stop (index into the trip's stop list).
    setStops(stops: { pos: LatLon; kind: StopKind; index: number; title: string }[], onDrag: (index: number, p: LatLon) => void) {
      stopLayer.clearLayers();
      for (const s of stops) {
        const m = L.marker(toLatLng(s.pos), { icon: pin(s.kind), draggable: true, keyboard: false, title: `${s.title} (sürükleyerek taşı)`, autoPan: true, zIndexOffset: 1000 }).addTo(stopLayer);
        m.on("dragend", () => onDrag(s.index, fromLatLng(m.getLatLng())));
      }
    },

    // A dropped pin with a place card, like tapping an empty spot in a map app.
    openPlace(p: LatLon, content: HTMLElement) {
      dropped?.remove();
      dropped = L.circleMarker(toLatLng(p), { radius: 7, className: "dropped-pin", interactive: false }).addTo(map);
      const popup = L.popup({ className: "wx-popup place-popup", closeButton: true, offset: [0, -4], maxWidth: 300, minWidth: 240, autoPanPaddingTopLeft: [16, 16] })
        .setLatLng(toLatLng(p))
        .setContent(content)
        .openOn(map);
      popup.on("remove", () => {
        dropped?.remove();
        dropped = null;
      });
    },

    // Routes, alternatives first so the selected one stays on top; each gets a duration bubble
    // at `labels[i]` that selects it.
    setRoutes(routes: LatLon[][], selected: number, onRouteClick: (i: number, p: LatLon) => void, labels: { pos: LatLon; text: string }[] = []) {
      routeLayer.clearLayers();
      labelLayer.clearLayers();
      labels.forEach((l, i) => {
        L.marker(toLatLng(l.pos), {
          icon: L.divIcon({ className: "route-label-marker", html: `<span class="route-label${i === selected ? " selected" : ""}">${l.text}</span>`, iconSize: undefined }),
          keyboard: false,
          zIndexOffset: i === selected ? 500 : 0,
        })
          .on("click", () => i !== selected && onRouteClick(i, l.pos))
          .addTo(labelLayer);
      });
      // Alternatives first so the selected route stays on top; the selected one gets a casing.
      const order = routes.map((_, i) => i).sort((a, b) => Number(a === selected) - Number(b === selected));
      for (const i of order) {
        const latlngs = routes[i].map(toLatLng);
        const lines =
          i === selected
            ? [L.polyline(latlngs, { weight: 11, className: "route route-casing" }), L.polyline(latlngs, { weight: 6, className: "route route-selected" })]
            : [L.polyline(latlngs, { weight: 6, className: "route route-alt" })];
        for (const line of lines) {
          line
            .addTo(routeLayer)
            .on("click", (e) => {
              L.DomEvent.stopPropagation(e);
              if (!routeDragged) onRouteClick(i, fromLatLng(e.latlng));
            })
            .on("mousedown", (e) => startRouteDrag(i, e));
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

    // Fuel and rest stops; each popup is built by the caller (it holds the "add break" button).
    setPois(pois: { pos: LatLon; pin: string; popup: () => HTMLElement }[]) {
      poiLayer.clearLayers();
      poiMarkers = pois.map((p) =>
        L.marker(toLatLng(p.pos), { icon: L.divIcon({ className: "poi-marker", html: p.pin, iconSize: [26, 26] }) })
          .bindPopup(p.popup, { className: "wx-popup", closeButton: false, offset: [0, -6] })
          .addTo(poiLayer),
      );
    },

    openPoi(i: number) {
      const m = poiMarkers[i];
      if (!m) return;
      map.panTo(m.getLatLng());
      m.openPopup();
    },

    closePopup: () => map.closePopup(),

    // "Konumumu göster": a blue dot at the device position, opening the place card on tap.
    showMe(p: LatLon, onTap: () => void) {
      meDot?.remove();
      meDot = L.circleMarker(toLatLng(p), { radius: 8, className: "live-dot" }).on("click", onTap).addTo(map);
      map.flyTo(toLatLng(p), Math.max(map.getZoom(), 14));
    },

    // The rider's position in live mode; follow pans the map to it.
    setLivePosition(p: LatLon | null, follow: boolean) {
      if (!p) {
        liveDot?.remove();
        liveDot = null;
        return;
      }
      if (!liveDot) liveDot = L.circleMarker(toLatLng(p), { radius: 9, className: "live-dot", interactive: false }).addTo(map);
      else liveDot.setLatLng(toLatLng(p));
      if (follow) map.panTo(toLatLng(p));
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
