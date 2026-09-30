import { t, units } from "../i18n";
import { LngLatBounds, Map as GLMap, Marker, Popup, ScaleControl, setWorkerUrl, type IControl, type LngLatLike, type MapMouseEvent, type Point, type PositionAnchor } from "maplibre-gl";
// MapLibre looks for its worker next to its own file, which bundling moves; Vite builds the worker
// as a file of its own and gives its URL.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { fromLngLat as latLon, toLngLat as lngLat, type LatLon } from "../core/geo";

import { icons } from "./icons";
import type { StopKind } from "./trip";

setWorkerUrl(workerUrl);

// Base maps come from ui/layers.ts (MapLibre styles). Lines and dots over the map are SVG drawn
// here, so CSS styles and animates them (the route drawing itself, the risk colours flowing in);
// pins, tags and bubbles are DOM markers.

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
const SVG_NS = "http://www.w3.org/2000/svg";

// Zoom levels are MapLibre's (512 px tiles): one less than Leaflet's or a raster tile's level.
const START_VIEW = { center: [35, 39] as LngLatLike, zoom: 5 };
const LOCATE_ZOOM = 13;
// Draw order of the DOM markers.
const Z = { break: "1", stop: "2", measure: "3", weather: "4", label: "5", labelSelected: "6" };


// A map button in a MapLibre corner, styled like the zoom buttons.
function mapControl(el: HTMLElement): IControl {
  el.classList.add("maplibregl-ctrl");
  return { onAdd: () => el, onRemove: () => el.remove() };
}
function mapButton(html: string, label: string, onClick: (b: HTMLButtonElement) => void, id?: string) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "map-btn";
  b.innerHTML = html;
  b.setAttribute("aria-label", label);
  b.title = label;
  if (id) b.id = id;
  b.addEventListener("click", () => onClick(b));
  return b;
}

// A shape of the SVG overlay: a line through `coords` or a dot at `coords[0]`.
interface Shape {
  el: SVGPathElement | SVGCircleElement;
  coords: LatLon[];
}

// Lines and dots in map coordinates, placed again on every camera change so they follow pan, zoom,
// rotation and pitch. A layer is a group; later layers draw over earlier ones.
function createOverlay(gl: GLMap) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "map-overlay");
  gl.getCanvasContainer().append(svg);
  const shapes = new Set<Shape>();

  function place(s: Shape) {
    if (s.el instanceof SVGCircleElement) {
      const p = gl.project(lngLat(s.coords[0]));
      s.el.setAttribute("cx", p.x.toFixed(1));
      s.el.setAttribute("cy", p.y.toFixed(1));
      return;
    }
    // Points closer than a pixel to the last one add nothing on screen.
    let d = "";
    let lx = NaN;
    let ly = NaN;
    s.coords.forEach((c, i) => {
      const p = gl.project(lngLat(c));
      if (i > 0 && i < s.coords.length - 1 && Math.abs(p.x - lx) < 1 && Math.abs(p.y - ly) < 1) return;
      d += `${d ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      lx = p.x;
      ly = p.y;
    });
    s.el.setAttribute("d", d);
  }
  const redraw = () => shapes.forEach(place);
  gl.on("move", redraw);
  gl.on("resize", redraw);

  function layer(parent: SVGElement = svg) {
    const g = document.createElementNS(SVG_NS, "g");
    parent.append(g);
    const own = new Set<Shape>();
    const add = (s: Shape, cls: string, interactive: boolean) => {
      s.el.setAttribute("class", cls + (interactive ? " map-hit" : ""));
      g.append(s.el);
      own.add(s);
      shapes.add(s);
      place(s);
      return s;
    };
    const drop = (s: Shape) => {
      s.el.remove();
      own.delete(s);
      shapes.delete(s);
    };
    return {
      g,
      line(coords: LatLon[], cls: string, weight: number, interactive = false) {
        const el = document.createElementNS(SVG_NS, "path");
        el.setAttribute("stroke-width", String(weight));
        el.setAttribute("fill", "none");
        return add({ el, coords }, cls, interactive);
      },
      dot(p: LatLon, cls: string, radius: number, interactive = false) {
        const el = document.createElementNS(SVG_NS, "circle");
        el.setAttribute("r", String(radius));
        return add({ el, coords: [p] }, cls, interactive);
      },
      move(s: Shape, coords: LatLon[]) {
        s.coords = coords;
        place(s);
      },
      drop,
      clear: () => own.forEach(drop),
      remove() {
        own.forEach(drop);
        g.remove();
      },
    };
  }
  return { svg, layer };
}
export type OverlayLayer = ReturnType<ReturnType<typeof createOverlay>["layer"]>;

export function createMap(el: HTMLElement, h: MapHandlers) {
  const gl = new GLMap({
    container: el,
    style: { version: 8, sources: {}, layers: [] }, // the base map arrives from ui/layers.ts
    ...START_VIEW,
    attributionControl: { compact: true },
    maxPitch: 60,
    clickTolerance: 4,
  });
  el.style.setProperty("--pin-scale", "1");

  // Bottom-right stack like Google Maps: scale, zoom, compass, then "my location" on top.
  gl.addControl(new ScaleControl({ maxWidth: 100, unit: units }), "bottom-right");
  const zoom = document.createElement("div");
  zoom.className = "map-zoom";
  zoom.append(mapButton(icons.plus, t.map.zoomIn, () => gl.zoomIn()), mapButton(icons.minus, t.map.zoomOut, () => gl.zoomOut()));
  gl.addControl(mapControl(zoom), "bottom-right");
  // The compass shows once the map is turned or tilted; it points north and resets both.
  const compass = mapButton(icons.compass, t.map.north, () => gl.resetNorthPitch(), "compass");
  compass.hidden = true;
  const turnCompass = () => {
    compass.hidden = !gl.getBearing() && !gl.getPitch();
    compass.style.setProperty("--bearing", `${-gl.getBearing()}deg`);
  };
  gl.on("rotate", turnCompass);
  gl.on("pitch", turnCompass);
  gl.addControl(mapControl(compass), "bottom-right");
  gl.addControl(mapControl(mapButton(icons.locate, t.map.locate, () => h.onLocate(), "locate")), "bottom-right");
  gl.addControl(mapControl(mapButton(icons.layers, t.map.layers, () => {}, "layers")), "top-right");

  const overlay = createOverlay(gl);
  const routeLayer = overlay.layer();
  // Risk colours and the sleepers of dark parts sit over the route, so redrawing the route on an
  // edit never hides them; each paint gets its own group, so old and new ones can crossfade.
  const riskPane = overlay.layer();
  let riskLayer = overlay.layer(riskPane.g);
  let riskKey = ""; // what the shown colours are, to skip repaints that change nothing
  const measureLayer = overlay.layer();
  const dots = overlay.layer(); // dropped pin, device and rider dots, profile probe, drag ghost

  // Pins, tags and bubbles: DOM markers. Clicks on them and on route lines are theirs, not the map's.
  const marker = (p: LatLon, node: HTMLElement, opts: { anchor?: PositionAnchor; draggable?: boolean; z: string; title?: string }) => {
    node.style.zIndex = opts.z;
    if (opts.title) node.title = opts.title;
    return new Marker({ element: node, anchor: opts.anchor ?? "center", draggable: opts.draggable ?? false }).setLngLat(lngLat(p));
  };
  const ownTarget = (e: MapMouseEvent) => !!(e.originalEvent.target as Element | null)?.closest?.(".maplibregl-marker, .map-hit, .maplibregl-popup");

  // One popup at a time, closed by a click on the map (not on a marker, which may open another).
  let popup: Popup | null = null;
  const closePopup = () => {
    popup?.remove();
    popup = null;
  };
  const openPopup = (p: LatLon, content: HTMLElement | string, opts: { className: string; closeButton: boolean; offset: number; maxWidth: number }) => {
    closePopup();
    const next = new Popup({ className: opts.className, closeButton: opts.closeButton, closeOnClick: false, anchor: "bottom", offset: opts.offset, maxWidth: `${opts.maxWidth}px` }).setLngLat(lngLat(p));
    if (typeof content === "string") next.setHTML(content);
    else next.setDOMContent(content);
    next.on("close", () => popup === next && (popup = null));
    popup = next.addTo(gl);
    // Keep the card inside the view, like Leaflet's popup auto-pan.
    const box = next.getElement().getBoundingClientRect();
    const view = el.getBoundingClientRect();
    const dx = Math.min(0, view.right - 16 - box.right) || Math.max(0, view.left + 16 - box.left);
    const dy = Math.max(0, view.top + 16 - box.top);
    if (dx || dy) gl.panBy([-dx, -dy]);
    return next;
  };

  // Dragging a route line (mouse) drops a via point where it is released, like Google Maps.
  // A press without movement stays a click (select the route or add a break).
  let routeDragged = false;
  function startRouteDrag(i: number, e: MouseEvent) {
    if (e.button !== 0) return;
    e.stopPropagation(); // not a map pan
    const box = el.getBoundingClientRect();
    const at = (ev: MouseEvent) => latLon(gl.unproject([ev.clientX - box.left, ev.clientY - box.top]));
    const grab = at(e);
    let ghost: ReturnType<OverlayLayer["dot"]> | null = null;
    const move = (ev: MouseEvent) => {
      if (!ghost && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 6) return;
      if (!ghost) ghost = dots.dot(at(ev), "route-drag-ghost", 7);
      dots.move(ghost, [at(ev)]);
    };
    const up = () => {
      removeEventListener("mousemove", move);
      removeEventListener("mouseup", up);
      if (!ghost) return;
      const drop = ghost.coords[0];
      dots.drop(ghost);
      routeDragged = true;
      setTimeout(() => (routeDragged = false), 0);
      h.onRouteDrag(i, grab, drop);
    };
    addEventListener("mousemove", move);
    addEventListener("mouseup", up);
  }

  gl.on("click", (e) => {
    if (ownTarget(e)) return;
    closePopup();
    h.onClick(latLon(e.lngLat));
  });
  gl.on("contextmenu", (e) => {
    e.originalEvent.preventDefault();
    if (ownTarget(e)) return;
    h.onContext(latLon(e.lngLat), e.originalEvent.clientX, e.originalEvent.clientY);
  });
  gl.on("movestart", () => h.onMoveStart());
  gl.on("dragstart", () => h.onDrag());

  let dropped: ReturnType<OverlayLayer["dot"]> | null = null;
  const breakMarkers: Marker[] = [];
  const stopMarkers: Marker[] = [];
  let labelMarkers: Marker[] = [];
  let liveDot: ReturnType<OverlayLayer["dot"]> | null = null;
  let meDot: ReturnType<OverlayLayer["dot"]> | null = null;
  let probe: ReturnType<OverlayLayer["dot"]> | null = null;
  let weatherMarkers: { m: Marker; pos: LatLon; shown: boolean }[] = [];
  const clearMarkers = (list: Marker[]) => list.splice(0).forEach((m) => m.remove());

  // Shows only tags that do not overlap the previous shown one or a route's duration label, so
  // the route stays visible when zoomed out. The arrival point always shows.
  const MIN_GAP_PX = 92;
  const LABEL_GAP_PX = 64;
  let labelSpots: LatLon[] = [];
  function thinWeather() {
    let last: Point | null = null;
    const labels = labelSpots.map((l) => gl.project(lngLat(l)));
    weatherMarkers.forEach((w, i) => {
      const p = gl.project(lngLat(w.pos));
      const isLast = i === weatherMarkers.length - 1;
      const show = isLast || !((last && p.dist(last) < MIN_GAP_PX) || labels.some((l) => p.dist(l) < LABEL_GAP_PX));
      if (show !== w.shown) show ? w.m.addTo(gl) : w.m.remove();
      w.shown = show;
      if (show) last = p;
    });
  }
  gl.on("zoomend", thinWeather);

  // Stop pins shrink as the map zooms out: 0.6 at zoom 5 and below, full size from 11 (style.css
  // reads --pin-scale).
  // The start dot shows once the scale bar (at most 100 px, rounded down) reads 300 m or less, that is
  // under 5 m per pixel; its name stays at every zoom.
  const START_DOT_M_PER_PX = 5;
  const scalePins = () => {
    el.style.setProperty("--pin-scale", String(Math.min(1, Math.max(0.6, 0.6 + (gl.getZoom() - 5) * 0.067))));
    const mPerPx = (40_075_017 * Math.cos((gl.getCenter().lat * Math.PI) / 180)) / (512 * 2 ** gl.getZoom());
    el.classList.toggle("start-far", mPerPx > START_DOT_M_PER_PX);
  };
  gl.on("zoom", scalePins);
  scalePins();

  // The signature moment: a new selected route draws itself from start to end with the red clock
  // hand at its tip; alternatives fade in behind it, labels, risk colours and weather stations
  // arrive in step. Only when the geometry is new, never on re-edits of the same route.
  let drawn: LatLon[] | null = null;
  let drawAt = -Infinity; // performance.now() when the last draw started
  let riskFor: LatLon[] | null = null;
  // Removal runs on a timer, not on the animation's end: a background tab may never finish it.
  const fade = (layer: OverlayLayer, from: number, to: number, ms: number, delay = 0) =>
    layer.g.animate([{ opacity: from }, { opacity: to }], { duration: ms, delay, easing: "ease-out", fill: "both" });
  const fadeOut = (layer: OverlayLayer, ms: number, delay = 0) => {
    fade(layer, 1, 0, ms, delay);
    setTimeout(() => layer.remove(), delay + ms + 20);
  };
  let weatherFor: LatLon[] | null = null;
  const drawEnd = () => drawAt + DRAW_MS;

  function drawIn(paths: SVGPathElement[]) {
    const main = paths[paths.length - 1];
    const hand = document.createElementNS(SVG_NS, "circle");
    hand.setAttribute("r", "7");
    hand.setAttribute("class", "route-hand");
    main.parentNode!.appendChild(hand);
    const t0 = performance.now();
    const frame = (now: number) => {
      if (!main.isConnected) return hand.remove();
      const k = Math.min(1, (now - t0) / DRAW_MS);
      const len = main.getTotalLength(); // every frame: a camera move mid-draw re-projects the path
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
    const node = document.createElement("div");
    node.className = me ? "stop-marker me-stop" : "stop-marker";
    node.style.width = node.style.height = `${size}px`;
    node.innerHTML = `<span class="pin pin-${kind}" style="width:${size}px;height:${size}px"></span>`;
    if (kind !== "via") node.append(Object.assign(document.createElement("span"), { className: "pin-name", textContent: name }));
    return node;
  };

  // A path click (select the route or add a break) at the map point under the pointer.
  const pointAt = (e: MouseEvent) => {
    const box = el.getBoundingClientRect();
    return latLon(gl.unproject([e.clientX - box.left, e.clientY - box.top]));
  };

  return {
    gl,
    overlay: () => overlay.layer(measureLayer.g),
    marker,
    Z,

    center: () => latLon(gl.getCenter()),

    // Stop pins; dragging one moves that stop (index into the trip's stop list).
    // A stop at "my location" (me) hides while the device dot shows (style.css .has-me).
    setStops(stops: { pos: LatLon; kind: StopKind; index: number; title: string; name: string; me?: boolean }[], onDrag: (index: number, p: LatLon) => void) {
      clearMarkers(stopMarkers);
      for (const s of stops) {
        const m = marker(s.pos, pin(s.kind, s.name, s.me), { draggable: true, z: Z.stop, title: t.map.dragStop(s.title) }).addTo(gl);
        m.on("dragend", () => onDrag(s.index, latLon(m.getLngLat())));
        stopMarkers.push(m);
      }
    },

    // A dropped pin with a place card, like tapping an empty spot in a map app.
    openPlace(p: LatLon, content: HTMLElement) {
      if (dropped) dots.drop(dropped);
      const pinDot = (dropped = dots.dot(p, "dropped-pin", 7));
      openPopup(p, content, { className: "wx-popup place-popup", closeButton: true, offset: 10, maxWidth: 300 }).on("close", () => {
        dots.drop(pinDot);
        if (dropped === pinDot) dropped = null;
      });
    },

    // Routes, alternatives first so the selected one stays on top; each gets a duration bubble
    // at `labels[i]` that selects it.
    setRoutes(routes: LatLon[][], selected: number, onRouteClick: (i: number, p: LatLon) => void, labels: { pos: LatLon; text: string }[] = []) {
      routeLayer.clear();
      clearMarkers(labelMarkers);
      const draw = !!routes[selected] && routes[selected] !== drawn && !reducedMotion.matches;
      drawn = routes[selected] ?? null;
      if (draw) {
        drawAt = performance.now();
        // The old route's colours leave before the new line draws.
        const old = riskLayer;
        riskLayer = overlay.layer(riskPane.g);
        riskKey = "";
        fadeOut(old, 250);
      }
      // Labels pop in just before the hand arrives, for as long as a draw is running.
      const labelAt = Math.max(0, drawEnd() - performance.now() - 250);
      const arriving = performance.now() < drawEnd();
      labelSpots = labels.map((l) => l.pos);
      labelMarkers = labels.map((l, i) => {
        const node = document.createElement("div");
        node.className = `route-label-marker${arriving ? " arrive" : ""}`;
        node.innerHTML = `<span class="route-label${i === selected ? " selected" : ""}" style="--at:${Math.round(labelAt)}ms">${l.text}</span>`;
        node.addEventListener("click", () => i !== selected && onRouteClick(i, l.pos));
        return marker(l.pos, node, { anchor: "top-left", z: i === selected ? Z.labelSelected : Z.label }).addTo(gl);
      });
      // Alternatives first so the selected route stays on top; the selected one gets a casing.
      const order = routes.map((_, i) => i).sort((a, b) => Number(a === selected) - Number(b === selected));
      for (const i of order) {
        const lines =
          i === selected
            ? [routeLayer.line(routes[i], "route route-casing", 11, true), routeLayer.line(routes[i], "route route-selected", 6, true)]
            : [routeLayer.line(routes[i], "route route-alt", 6, true)];
        const paths = lines.map((l) => l.el as SVGPathElement);
        for (const p of paths) {
          p.addEventListener("click", (e) => !routeDragged && onRouteClick(i, pointAt(e)));
          p.addEventListener("mousedown", (e) => startRouteDrag(i, e));
        }
        if (draw && i === selected) drawIn(paths);
        else if (draw) for (const p of paths) p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: DRAW_MS * 0.45, fill: "backwards" });
      }
    },

    // Draggable break markers that stay on the route while dragged.
    setBreaks(points: LatLon[], snap: (p: LatLon) => LatLon, onMove: (i: number, p: LatLon) => void) {
      clearMarkers(breakMarkers);
      points.forEach((p, i) => {
        const node = document.createElement("div");
        node.className = "break-marker";
        node.style.width = node.style.height = "24px";
        node.textContent = `${i + 1}`;
        const m = marker(p, node, { draggable: true, z: Z.break, title: t.map.break(i + 1) }).addTo(gl);
        m.on("drag", () => m.setLngLat(lngLat(snap(latLon(m.getLngLat())))));
        m.on("dragend", () => onMove(i, latLon(m.getLngLat())));
        breakMarkers.push(m);
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
      const layer = (riskLayer = overlay.layer(riskPane.g));
      const motion = !reducedMotion.matches;
      const wait = Math.max(0, drawEnd() - performance.now());
      const add = (coords: LatLon[], cls: string, weight: number, from: number, to: number) => {
        const path = layer.line(coords, `route ${cls}`, weight).el as SVGPathElement;
        if (!motion || !first) return;
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
    // of the route); afterwards the plain tag, so tags re-added by zoom thinning do not replay it.
    setWeather(points: { pos: LatLon; pin: string; card: () => HTMLElement; frac: number }[]) {
      const arrive = points.length > 0 && !!drawn && weatherFor !== drawn && !reducedMotion.matches;
      if (arrive) weatherFor = drawn;
      weatherMarkers.forEach((w) => w.m.remove());
      let longest = 0;
      weatherMarkers = points.map((p) => {
        const delay = arrive ? arrivalDelay(p.frac) : 0;
        longest = Math.max(longest, delay);
        const node = document.createElement("div");
        node.className = arrive ? "wx-marker arrive" : "wx-marker";
        node.innerHTML = arrive ? `<span style="--at:${Math.round(delay)}ms">${p.pin}</span>` : p.pin;
        node.addEventListener("click", () => openPopup(p.pos, p.card(), { className: "wx-popup", closeButton: false, offset: 44, maxWidth: 280 }));
        return { m: marker(p.pos, node, { anchor: "top-left", z: Z.weather }), pos: p.pos, shown: false };
      });
      if (arrive) {
        const markers = weatherMarkers;
        setTimeout(
          () =>
            markers.forEach((w, i) => {
              const node = w.m.getElement();
              node.classList.remove("arrive"); // className would drop MapLibre's own classes
              node.innerHTML = points[i].pin;
            }),
          longest + 700,
        );
      }
      thinWeather();
    },

    openWeather(i: number) {
      const w = weatherMarkers[i];
      if (!w) return;
      if (!w.shown) (w.m.addTo(gl), (w.shown = true)); // may be thinned out at this zoom
      // The card opens once the map has come to the tag (at once when it is already there).
      let opened = false;
      const open = () => !opened && ((opened = true), w.m.getElement().click());
      gl.once("moveend", open);
      gl.panTo(lngLat(w.pos), { duration: 300 });
      setTimeout(open, 400);
    },

    closePopup,

    // The point under the height profile's cursor; null hides it.
    showProbe(p: LatLon | null) {
      if (!p) {
        if (probe) dots.drop(probe);
        probe = null;
        return;
      }
      if (!probe) probe = dots.dot(p, "profile-probe", 6);
      else dots.move(probe, [p]);
    },

    // "Konumumu göster": a red dot at the device position, opening the place card on tap.
    showMe(p: LatLon, onTap: () => void) {
      if (meDot) dots.drop(meDot);
      meDot = dots.dot(p, "live-dot", 8, true);
      meDot.el.addEventListener("click", onTap);
      el.classList.add("has-me");
      gl.flyTo({ center: lngLat(p), zoom: Math.max(gl.getZoom(), LOCATE_ZOOM) });
    },

    // The rider's position in live mode; follow pans the map to it (at `zoom` when given), centred
    // in the part above `bottomPx`.
    setLivePosition(p: LatLon | null, follow: boolean, zoom?: number, bottomPx = 0) {
      if (!p) {
        if (liveDot) dots.drop(liveDot);
        liveDot = null;
        el.classList.toggle("has-me", !!meDot);
        return;
      }
      el.classList.add("has-me");
      if (!liveDot) liveDot = dots.dot(p, "live-dot", 9);
      else dots.move(liveDot, [p]);
      if (!follow) return;
      const z = Math.min(zoom ?? gl.getZoom(), gl.getMaxZoom());
      gl.easeTo({ center: lngLat(p), zoom: z, offset: [0, -bottomPx / 2], duration: zoom !== undefined ? 0 : 500 });
    },

    // Fits the points into the part of the map the sheet does not cover.
    fit(points: LatLon[], insets: { left: number; bottom: number }) {
      if (!points.length) return;
      const b = new LngLatBounds();
      for (const p of points) b.extend(lngLat(p));
      gl.fitBounds(b, { padding: { top: 48, left: insets.left + 32, right: 104, bottom: insets.bottom + 32 }, duration: 600 }); // right: room for the end pin's name
    },
  };
}

export type MapView = ReturnType<typeof createMap>;
