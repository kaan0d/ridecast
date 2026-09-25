import { t } from "../i18n";
import L from "leaflet";
import { fromLatLng, toLatLng, type LatLon } from "../core/geo";

import { icons } from "./icons";
import type { StopKind } from "./trip";

// Base tiles come from ui/layers.ts (OSM muted by CSS, satellite, terrain).

interface MapHandlers {
  onClick(p: LatLon): void;
  onContext(p: LatLon, x: number, y: number): void; // right click or long press, screen point
  onMoveStart(): void;
  onDrag(): void; // the user dragged the map (not a programmatic pan)
  onLocate(): void;
  onRouteDrag(i: number, grab: LatLon, drop: LatLon): void; // a route line dragged to a new point
}

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const DRAW_MS = 1300; // a new route draws itself in this time
const WAVE_MS = 700; // stations of a route drawn earlier come in over this time
const FLOW_MS = 1400; // the first risk colours flow from start to end in this time
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2); // --ease-draw

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
  L.control.zoom({ position: "bottomright", zoomInTitle: t.map.zoomIn, zoomOutTitle: t.map.zoomOut }).addTo(map);
  mapButton("bottomright", icons.locate, t.map.locate, () => h.onLocate(), "locate").addTo(map);
  mapButton("topright", icons.layers, t.map.layers, () => {}, "layers").addTo(map);

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
  map.on("dragstart", () => h.onDrag());

  const routeLayer = L.layerGroup().addTo(map);
  // Risk colours and the sleepers of dark parts sit in their own pane over the route, so redrawing
  // the route on an edit never hides them (overlay pane 400, markers 600).
  map.createPane("risk").style.zIndex = "450";
  const riskRenderer = L.svg({ pane: "risk" });
  let riskLayer = L.layerGroup().addTo(map);
  let riskKey = ""; // what the shown colours are, to skip repaints that change nothing
  const stopLayer = L.layerGroup().addTo(map);
  const weatherLayer = L.layerGroup().addTo(map);
  const labelLayer = L.layerGroup().addTo(map);
  let dropped: L.CircleMarker | null = null;
  const breakLayer = L.layerGroup().addTo(map);
  let liveDot: L.CircleMarker | null = null;
  let meDot: L.CircleMarker | null = null;
  let weatherMarkers: L.Marker[] = [];

  // Shows only tags that do not overlap the previous shown one or a route's duration label, so
  // the route stays visible when zoomed out. The arrival point always shows.
  const MIN_GAP_PX = 92;
  const LABEL_GAP_PX = 64;
  let labelSpots: L.LatLngExpression[] = [];
  function thinWeather() {
    weatherLayer.clearLayers();
    let last: L.Point | null = null;
    const labels = labelSpots.map((l) => map.latLngToContainerPoint(l));
    weatherMarkers.forEach((m, i) => {
      const p = map.latLngToContainerPoint(m.getLatLng());
      const isLast = i === weatherMarkers.length - 1;
      if (!isLast && ((last && p.distanceTo(last) < MIN_GAP_PX) || labels.some((l) => p.distanceTo(l) < LABEL_GAP_PX))) return;
      m.addTo(weatherLayer);
      last = p;
    });
  }
  map.on("zoomend", thinWeather);

  // Stop pins shrink as the map zooms out: 0.6 at zoom 6 and below, full size from 12 (style.css
  // reads --pin-scale).
  // The start dot shows once the scale bar (at most 100 px, rounded down) reads 300 m or less, that is
  // under 5 m per pixel; its name stays at every zoom.
  const START_DOT_M_PER_PX = 5;
  const scalePins = () => {
    el.style.setProperty("--pin-scale", String(Math.min(1, Math.max(0.6, 0.6 + (map.getZoom() - 6) * 0.067))));
    const mPerPx = (40_075_017 * Math.cos((map.getCenter().lat * Math.PI) / 180)) / (256 * 2 ** map.getZoom());
    el.classList.toggle("start-far", mPerPx > START_DOT_M_PER_PX);
  };
  map.on("zoom", scalePins);
  scalePins();

  // The signature moment: a new selected route draws itself from start to end with the red clock
  // hand at its tip; alternatives fade in behind it, labels, risk colours and weather stations
  // arrive in step. Only when the geometry is new, never on re-edits of the same route.
  let drawn: LatLon[] | null = null;
  let drawAt = -Infinity; // performance.now() when the last draw started
  let riskFor: LatLon[] | null = null;
  // Removal runs on a timer, not on the animation's end: a background tab may never finish it.
  const fade = (group: L.LayerGroup, from: number, to: number, ms: number, delay = 0) => {
    for (const l of group.getLayers()) (l as L.Path).getElement()?.animate([{ opacity: from }, { opacity: to }], { duration: ms, delay, easing: "ease-out", fill: "both" });
  };
  const fadeOut = (group: L.LayerGroup, ms: number, delay = 0) => {
    fade(group, 1, 0, ms, delay);
    setTimeout(() => group.remove(), delay + ms + 20);
  };
  let weatherFor: LatLon[] | null = null;
  const drawEnd = () => drawAt + DRAW_MS;

  function drawIn(paths: SVGPathElement[]) {
    const main = paths[paths.length - 1];
    const hand = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    hand.setAttribute("r", "7");
    hand.setAttribute("class", "route-hand");
    main.parentNode!.appendChild(hand);
    const t0 = performance.now();
    const frame = (now: number) => {
      if (!main.isConnected) return hand.remove();
      const k = Math.min(1, (now - t0) / DRAW_MS);
      const len = main.getTotalLength(); // every frame: a zoom mid-draw re-projects the path
      const at = len * easeInOut(k);
      for (const p of paths) p.style.strokeDasharray = `${at} ${len}`;
      const pt = main.getPointAtLength(at);
      hand.setAttribute("cx", String(pt.x));
      hand.setAttribute("cy", String(pt.y));
      if (k < 1) return void requestAnimationFrame(frame);
      for (const p of paths) p.style.strokeDasharray = "";
      hand.style.transformOrigin = `${pt.x}px ${pt.y}px`;
      hand.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(2.2)" }], { duration: 420, easing: "ease-out" }).finished.then(() => hand.remove());
    };
    for (const p of paths) p.style.strokeDasharray = `0 ${main.getTotalLength()}`;
    requestAnimationFrame(frame);
  }

  // A path drawn in from its start at a steady pace, after `delay` ms.
  function sweep(path: SVGPathElement, delay: number, ms: number) {
    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len} ${len}`;
    path
      .animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: ms, delay, easing: "linear", fill: "backwards" })
      .finished.then(
        () => (path.style.strokeDasharray = ""),
        () => {},
      );
  }

  // Delay for something at `frac` of the route: when the hand passes it, or a quick wave after.
  const arrivalDelay = (frac: number) => {
    const now = performance.now();
    return now < drawEnd() ? Math.max(0, drawAt + easeInOut(Math.min(1, frac)) * DRAW_MS - now) : frac * WAVE_MS;
  };

  // Start and end pins carry their name beside them: they sit on the town's own map label.
  const pin = (kind: StopKind, name: string, me?: boolean) => {
    const size = kind === "via" ? 11 : 14;
    const html = document.createElement("span");
    html.innerHTML = `<span class="pin pin-${kind}" style="width:${size}px;height:${size}px"></span>`;
    if (kind !== "via") html.append(Object.assign(document.createElement("span"), { className: "pin-name", textContent: name }));
    return L.divIcon({ className: me ? "stop-marker me-stop" : "stop-marker", html: html.innerHTML, iconSize: [size, size] });
  };

  return {
    leaflet: map,

    center: () => fromLatLng(map.getCenter()),

    // Stop pins; dragging one moves that stop (index into the trip's stop list).
    // A stop at "my location" (me) hides while the device dot shows (style.css .has-me).
    setStops(stops: { pos: LatLon; kind: StopKind; index: number; title: string; name: string; me?: boolean }[], onDrag: (index: number, p: LatLon) => void) {
      stopLayer.clearLayers();
      for (const s of stops) {
        const m = L.marker(toLatLng(s.pos), { icon: pin(s.kind, s.name, s.me), draggable: true, keyboard: false, title: t.map.dragStop(s.title), autoPan: true, zIndexOffset: 1000 }).addTo(stopLayer);
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
      const draw = !!routes[selected] && routes[selected] !== drawn && !reducedMotion.matches;
      drawn = routes[selected] ?? null;
      if (draw) {
        drawAt = performance.now();
        // The old route's colours leave before the new line draws.
        const old = riskLayer;
        riskLayer = L.layerGroup().addTo(map);
        riskKey = "";
        fadeOut(old, 250);
      }
      // Labels pop in just before the hand arrives, for as long as a draw is running.
      const labelAt = Math.max(0, drawEnd() - performance.now() - 250);
      const arriving = performance.now() < drawEnd();
      labelSpots = labels.map((l) => toLatLng(l.pos));
      labels.forEach((l, i) => {
        L.marker(toLatLng(l.pos), {
          icon: L.divIcon({
            className: `route-label-marker${arriving ? " arrive" : ""}`,
            html: `<span class="route-label${i === selected ? " selected" : ""}" style="--at:${Math.round(labelAt)}ms">${l.text}</span>`,
            iconSize: undefined,
          }),
          keyboard: false,
          zIndexOffset: i === selected ? 2000 : 1500, // over the weather capsules
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
        const paths = lines.map((l) => l.getElement() as SVGPathElement | undefined).filter((p): p is SVGPathElement => !!p);
        if (draw && i === selected) drawIn(paths);
        else if (draw) for (const p of paths) p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: DRAW_MS * 0.45, fill: "backwards" });
      }
    },

    // Draggable break markers that stay on the route while dragged.
    setBreaks(points: LatLon[], snap: (p: LatLon) => LatLon, onMove: (i: number, p: LatLon) => void) {
      breakLayer.clearLayers();
      points.forEach((p, i) => {
        const m = L.marker(toLatLng(p), {
          draggable: true,
          title: t.map.break(i + 1),
          icon: L.divIcon({ className: "break-marker", html: `${i + 1}`, iconSize: [24, 24] }),
        }).addTo(breakLayer);
        m.on("drag", () => m.setLatLng(toLatLng(snap(fromLatLng(m.getLatLng())))));
        m.on("dragend", () => onMove(i, fromLatLng(m.getLatLng())));
      });
    },

    // Risk colours over the selected route and a dotted pattern on dark parts. Not clickable,
    // so a click still reaches the route below (adds a break). A route's first colours flow into
    // the line from start to end at one steady pace once the hand has passed; later changes on the
    // same route fade the new colours in over the old, then the old ones out beneath (`from`, `to`:
    // where a part starts and ends, as a share of the route).
    setRisk(segments: { coords: LatLon[]; level: number; from: number; to: number }[], night: { coords: LatLon[]; from: number; to: number }[]) {
      const key = `${segments.map((x) => `${x.level}:${x.from.toFixed(4)}`).join(",")}|${night.map((n) => n.from.toFixed(4)).join(",")}`;
      const first = riskFor !== drawn;
      if (!first && key === riskKey) return;
      riskFor = drawn;
      riskKey = key;
      const old = riskLayer;
      const layer = (riskLayer = L.layerGroup().addTo(map));
      const motion = !reducedMotion.matches;
      const wait = Math.max(0, drawEnd() - performance.now());
      const add = (coords: LatLon[], cls: string, weight: number, from: number, to: number) => {
        const line = L.polyline(coords.map(toLatLng), { renderer: riskRenderer, weight, interactive: false, className: `route ${cls}` }).addTo(layer);
        const path = line.getElement() as SVGPathElement | undefined;
        if (!motion || !first || !path) return;
        const at = wait + from * FLOW_MS;
        // Sleepers keep their dash pattern, so they fade in when the flow reaches them.
        if (cls === "route-night") path.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: at, fill: "backwards" });
        else sweep(path, at, Math.max(90, (to - from) * FLOW_MS));
      };
      for (const x of segments) if (x.level > 0) add(x.coords, `route-risk-${x.level}`, 6, x.from, x.to);
      for (const n of night) add(n.coords, "route-night", 3, n.from, n.to);
      if (!motion || first) return void old.remove();
      fade(layer, 0, 1, 450);
      fadeOut(old, 300, 450);
    },

    // Weather tags with a card popup each, over the stop pins (the first and last sit on them).
    // The first forecast of a route brings its stations in as the hand passes them (`frac`: share
    // of the route); afterwards the plain icon, so tags re-added by zoom thinning do not replay it.
    setWeather(points: { pos: LatLon; pin: string; card: string; frac: number }[]) {
      const arrive = points.length > 0 && !!drawn && weatherFor !== drawn && !reducedMotion.matches;
      if (arrive) weatherFor = drawn;
      const plain = (pin: string) => L.divIcon({ className: "wx-marker", html: pin, iconSize: undefined });
      let longest = 0;
      weatherMarkers = points.map((p) => {
        const delay = arrive ? arrivalDelay(p.frac) : 0;
        longest = Math.max(longest, delay);
        const icon = arrive ? L.divIcon({ className: "wx-marker arrive", html: `<span style="--at:${Math.round(delay)}ms">${p.pin}</span>`, iconSize: undefined }) : plain(p.pin);
        return L.marker(toLatLng(p.pos), { icon, keyboard: false, zIndexOffset: 1500 }).bindPopup(p.card, {
          className: "wx-popup",
          closeButton: false,
          offset: [0, -40],
          maxWidth: 280,
          minWidth: 240,
        });
      });
      if (arrive) {
        const markers = weatherMarkers;
        setTimeout(() => markers.forEach((m, i) => m.setIcon(plain(points[i].pin))), longest + 700);
      }
      thinWeather();
    },

    openWeather(i: number) {
      const m = weatherMarkers[i];
      if (!m) return;
      m.addTo(weatherLayer); // may be thinned out at this zoom
      map.panTo(m.getLatLng());
      m.openPopup();
    },

    closePopup: () => map.closePopup(),

    // "Konumumu göster": a red dot at the device position, opening the place card on tap.
    showMe(p: LatLon, onTap: () => void) {
      meDot?.remove();
      meDot = L.circleMarker(toLatLng(p), { radius: 8, className: "live-dot" }).on("click", onTap).addTo(map);
      el.classList.add("has-me");
      map.flyTo(toLatLng(p), Math.max(map.getZoom(), 14));
    },

    // The rider's position in live mode; follow pans the map to it (at `zoom` when given), centred
    // in the part above `bottomPx`.
    setLivePosition(p: LatLon | null, follow: boolean, zoom?: number, bottomPx = 0) {
      if (!p) {
        liveDot?.remove();
        liveDot = null;
        el.classList.toggle("has-me", !!meDot);
        return;
      }
      el.classList.add("has-me");
      if (!liveDot) liveDot = L.circleMarker(toLatLng(p), { radius: 9, className: "live-dot", interactive: false }).addTo(map);
      else liveDot.setLatLng(toLatLng(p));
      if (!follow) return;
      const z = Math.min(zoom ?? map.getZoom(), map.getMaxZoom());
      const centre = map.unproject(map.project(toLatLng(p), z).add([0, bottomPx / 2]), z);
      if (zoom !== undefined) map.setView(centre, z);
      else map.panTo(centre);
    },

    // Fits the points into the part of the map the sheet does not cover.
    fit(points: LatLon[], insets: { left: number; bottom: number }) {
      if (!points.length) return;
      map.fitBounds(L.latLngBounds(points.map(toLatLng)), {
        paddingTopLeft: [insets.left + 32, 48],
        paddingBottomRight: [104, insets.bottom + 32], // room for the end pin's name
      });
    },
  };
}
