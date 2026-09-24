import { t } from "../i18n";
import L from "leaflet";
import { getJson } from "../services/http";
import { formatClock } from "./format";

export type BaseId = "map" | "satellite" | "terrain";

// Keyless tile sources. The map is Stadia's Alidade Smooth, light or dark with the theme; OSM
// (muted by the CSS filter on `.base-muted` tiles) stands in when Stadia refuses the site. Imagery
// and topography keep their colours.
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

// Stadia serves registered domains and localhost without a key (client.stadiamaps.com); anywhere
// else its tiles are a "401 Invalid Authentication" image.
const stadiaUrl = () =>
  `https://tiles.stadiamaps.com/tiles/alidade_smooth${document.documentElement.dataset.theme === "dark" ? "_dark" : ""}/{z}/{x}/{y}{r}.png`;
const STADIA_CREDIT =
  '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// RainViewer serves radar tiles up to zoom 7 ("Zoom Level Not Supported" above); Leaflet scales them.
const RADAR_INDEX = "https://api.rainviewer.com/public/weather-maps.json";
const RADAR_MAX_NATIVE_ZOOM = 7;
const STORAGE_KEY = "ridecast.layers";

interface RadarIndex {
  host: string;
  radar: { past: { time: number; path: string }[] };
}

// Google Maps style "Katmanlar" panel: base map (map, satellite, terrain) and a rain radar overlay.
export function bindLayers(map: L.Map, button: HTMLElement, panel: HTMLElement) {
  const saved = load();
  let base = L.tileLayer("", {});
  let stadia = true; // false once Stadia refused this site: the map is OSM
  let shownUrl = "";
  let radar: L.TileLayer | null = null;

  function setBase(id: BaseId) {
    const b = id === "map" && stadia ? { ...BASES.map, url: stadiaUrl(), className: undefined, attribution: STADIA_CREDIT } : BASES[id];
    shownUrl = b.url;
    base.remove();
    base = L.tileLayer(b.url, { maxZoom: b.maxZoom, maxNativeZoom: b.maxZoom, attribution: b.attribution, className: b.className }).addTo(map);
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

  // The dark or light map follows the theme (also the light theme while riding).
  new MutationObserver(() => {
    if (saved.base === "map" && stadia && stadiaUrl() !== shownUrl) setBase("map");
  }).observe(document.documentElement, { attributeFilter: ["data-theme"] });

  setBase(saved.base);
  if (saved.radar) void setRadar(true);
  // One world tile tells whether Stadia serves this site; a refusal falls back to OSM. A failed
  // request (offline) keeps Stadia, whose tiles may be in the browser cache.
  fetch(stadiaUrl().replace("{z}/{x}/{y}{r}", "0/0/0"))
    .then((r) => {
      if (r.status !== 401 && r.status !== 403) return;
      stadia = false;
      if (saved.base === "map") setBase("map");
    })
    .catch(() => {});
}

// The chosen layers are a per-viewer convenience; storage may be blocked.
function load(): { base: BaseId; radar: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return { base: v.base in BASES ? v.base : "map", radar: v.radar === true };
  } catch {
    return { base: "map", radar: false };
  }
}

function save(v: { base: BaseId; radar: boolean }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch {
    // not remembered
  }
}
