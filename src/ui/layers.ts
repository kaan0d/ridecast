import { t } from "../i18n";
import L from "leaflet";
import { getJson } from "../services/http";
import { formatClock } from "./format";

export type BaseId = "map" | "satellite" | "terrain";
type MapStyle = "osm" | "simple";

interface Saved {
  base: BaseId;
  radar: boolean;
  style: MapStyle; // the "map" base: OSM (detailed) or Esri's grey canvas (simple)
  labels: boolean; // simple: place names
}

// Keyless tile sources. OSM is muted by the CSS filter on `.base-muted` tiles; imagery and
// topography keep their colours.
const BASES: Record<BaseId, { label: string; url: string; maxZoom: number; className?: string; attribution: string }> = {
  map: {
    label: t.layers.map,
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    maxZoom: 19,
    className: "base-muted",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    label: t.layers.satellite,
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 19,
    attribution: t.layers.satelliteCredit,
  },
  terrain: {
    label: t.layers.terrain,
    url: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
    maxZoom: 17,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM · <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
  },
};

// Simple map: Esri's keyless grey canvas, light or dark by theme, with its place names as a separate
// layer on top. Tiles go to zoom 16; Leaflet scales them beyond. (CARTO's tiles now need a key.)
const canvasUrl = (layer: "Base" | "Reference") =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${document.documentElement.dataset.theme === "dark" ? "Dark" : "Light"}_Gray_${layer}/MapServer/tile/{z}/{y}/{x}`;
const CANVAS_MAX_NATIVE_ZOOM = 16;
const CANVAS_CREDIT = "&copy; Esri, HERE, Garmin, OpenStreetMap";

// RainViewer serves radar tiles up to zoom 7 ("Zoom Level Not Supported" above); Leaflet scales them.
const RADAR_INDEX = "https://api.rainviewer.com/public/weather-maps.json";
const RADAR_MAX_NATIVE_ZOOM = 7;
const STORAGE_KEY = "ridecast.layers";

interface RadarIndex {
  host: string;
  radar: { past: { time: number; path: string }[] };
}

// Google Maps style "Katmanlar" panel: base map (map, satellite, terrain) and a rain radar overlay.
// `style`: the map style group on the settings page (detailed or simple, and the simple map's names).
export function bindLayers(map: L.Map, button: HTMLElement, panel: HTMLElement, style: HTMLElement) {
  const saved = load();
  let base = L.tileLayer("", {});
  let labels: L.TileLayer | null = null; // simple map: place names
  let shownUrl = "";
  let radar: L.TileLayer | null = null;

  function setBase(id: BaseId) {
    const simple = id === "map" && saved.style === "simple";
    const b = simple ? { ...BASES.map, url: canvasUrl("Base"), className: undefined, attribution: CANVAS_CREDIT } : BASES[id];
    const native = simple ? CANVAS_MAX_NATIVE_ZOOM : b.maxZoom;
    base.remove();
    labels?.remove();
    labels = null;
    shownUrl = b.url;
    base = L.tileLayer(b.url, { maxZoom: b.maxZoom, maxNativeZoom: native, attribution: b.attribution, className: b.className }).addTo(map);
    if (simple && saved.labels) labels = L.tileLayer(canvasUrl("Reference"), { maxZoom: b.maxZoom, maxNativeZoom: native }).addTo(map);
    base.bringToBack();
    map.setMaxZoom(b.maxZoom);
    saved.base = id;
    save(saved);
    render();
  }

  async function setRadar(on: boolean) {
    saved.radar = on;
    save(saved);
    radar?.remove();
    radar = null;
    render();
    if (!on) return;
    try {
      const idx = await getJson<RadarIndex>(RADAR_INDEX, 10000, true);
      const last = idx.radar.past[idx.radar.past.length - 1];
      if (!saved.radar || !last) return;
      radar = L.tileLayer(`${idx.host}${last.path}/256/{z}/{x}/{y}/2/1_1.png`, {
        maxNativeZoom: RADAR_MAX_NATIVE_ZOOM,
        maxZoom: 19,
        opacity: 0.7,
        className: "radar-layer",
        attribution: `Radar <a href="https://www.rainviewer.com/">RainViewer</a> · ${formatClock(last.time * 1000)}`,
      }).addTo(map);
      render(formatClock(last.time * 1000));
    } catch {
      render(undefined, t.layers.radarFailed);
    }
  }

  function render(radarTime?: string, radarError?: string) {
    panel.replaceChildren();
    const title = document.createElement("h2");
    title.className = "layers-title";
    title.textContent = t.layers.title;
    const row = document.createElement("div");
    row.className = "layers-bases";
    for (const [id, b] of Object.entries(BASES) as [BaseId, (typeof BASES)[BaseId]][]) {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = `layers-base layers-${id}`;
      opt.setAttribute("aria-pressed", String(saved.base === id));
      opt.innerHTML = `<span class="layers-thumb" aria-hidden="true"></span>`;
      opt.append(b.label);
      opt.addEventListener("click", () => setBase(id));
      row.append(opt);
    }
    const toggle = document.createElement("label");
    toggle.className = "layers-toggle";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = saved.radar;
    box.addEventListener("change", () => void setRadar(box.checked));
    const text = document.createElement("span");
    text.textContent = t.layers.radar;
    const note = document.createElement("small");
    note.textContent = radarError ?? (saved.radar ? (radarTime ? t.layers.radarAt(radarTime) : t.layers.radarLoading) : t.layers.radarIdle);
    toggle.append(box, text, note);
    panel.append(title, row, toggle);
  }

  button.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    button.setAttribute("aria-expanded", String(!panel.hidden));
  });
  addEventListener("pointerdown", (e) => {
    if (!panel.hidden && !panel.contains(e.target as Node) && !button.contains(e.target as Node)) {
      panel.hidden = true;
      button.setAttribute("aria-expanded", "false");
    }
  });

  // Settings page: not trip settings, so the settings form must not plan again.
  const input = (name: string) => style.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
  const options = style.querySelector<HTMLElement>("#simple-options")!;
  style.querySelector<HTMLInputElement>(`input[value="${saved.style}"]`)!.checked = true;
  input("map-labels").checked = saved.labels;
  options.hidden = saved.style !== "simple";
  style.addEventListener("input", (e) => {
    e.stopPropagation();
    saved.style = style.querySelector<HTMLInputElement>('input[name="map-style"]:checked')!.value as MapStyle;
    saved.labels = input("map-labels").checked;
    options.hidden = saved.style !== "simple";
    if (saved.base === "map") setBase("map");
    else save(saved);
  });
  // The simple map follows the theme (also the light theme while riding).
  new MutationObserver(() => {
    if (saved.base === "map" && saved.style === "simple" && canvasUrl("Base") !== shownUrl) setBase("map");
  }).observe(document.documentElement, { attributeFilter: ["data-theme"] });

  setBase(saved.base);
  if (saved.radar) void setRadar(true);
}

// The chosen layers are a per-viewer convenience; storage may be blocked.
function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return { base: v.base in BASES ? v.base : "map", radar: v.radar === true, style: v.style === "simple" ? "simple" : "osm", labels: v.labels !== false };
  } catch {
    return { base: "map", radar: false, style: "osm", labels: true };
  }
}

function save(v: Saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch {
    // not remembered
  }
}
