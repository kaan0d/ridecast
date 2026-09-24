import { t } from "../i18n";
import L from "leaflet";
import type { Map as GLMap, StyleSpecification } from "maplibre-gl";
import { getJson } from "../services/http";
import { formatClock } from "./format";

export type BaseId = "map" | "satellite" | "terrain";
type LabelKind = "roadNumbers" | "roadNames" | "places" | "pois";
type Labels = Record<LabelKind, boolean>;

interface Saved {
  base: BaseId;
  radar: boolean;
  labels: Labels; // what the vector map names (settings page)
  flavor: string; // its Protomaps flavor, or "auto": light or dark with the theme (settings page)
}

// The Protomaps style's label layers by kind. Anything not listed, like city, town, region and
// water names, always shows (Protomaps keeps towns and villages in the cities' layer).
const LABEL_LAYERS: Record<LabelKind, RegExp> = {
  roadNumbers: /^roads_shields$/,
  roadNames: /^roads_labels_/,
  places: /^places_subplace$/,
  pois: /^(pois|address_label)$/,
};
const DEFAULT_LABELS: Labels = { roadNumbers: false, roadNames: false, places: false, pois: false };

// Keyless tile sources. The map is a Protomaps extract of Turkey as vector tiles (MapLibre), light
// or dark with the theme, so its labels can be turned off; OSM (muted by the CSS filter on
// `.base-muted` tiles) stands in where the extract is not served. Imagery and topography keep their
// colours.
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

// The local, git-ignored protomaps/ folder (tiles, one style per flavor, fonts, sprites).
const PROTOMAPS = new URL("protomaps/", location.href).href;
const FLAVORS = ["auto", "light", "dark", "white", "grayscale", "black"];
function protomapsStyle(flavor: string) {
  if (flavor === "auto") flavor = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  return `${PROTOMAPS}styles/${flavor}.json`;
}

// The style files keep paths relative to protomaps/; MapLibre needs them whole. String joins, as
// URL() would escape the {fontstack} and {range} placeholders.
async function loadStyle(url: string) {
  const style = await getJson<StyleSpecification>(url, 10000);
  style.glyphs = PROTOMAPS + style.glyphs;
  style.sprite = PROTOMAPS + style.sprite;
  (style.sources.protomaps as { url: string }).url = `pmtiles://${PROTOMAPS}turkey.pmtiles`;
  return style;
}

// RainViewer serves radar tiles up to zoom 7 ("Zoom Level Not Supported" above); Leaflet scales them.
const RADAR_INDEX = "https://api.rainviewer.com/public/weather-maps.json";
const RADAR_MAX_NATIVE_ZOOM = 7;
const STORAGE_KEY = "ridecast.layers";

interface RadarIndex {
  host: string;
  radar: { past: { time: number; path: string }[] };
}

// Google Maps style "Katmanlar" panel: base map (map, satellite, terrain) and a rain radar overlay.
// `labels`: the map label switches on the settings page.
export function bindLayers(map: L.Map, button: HTMLElement, panel: HTMLElement, labels: HTMLElement) {
  const saved = load();
  let base: L.Layer = L.layerGroup();
  let gl: GLMap | null = null; // the vector map while it shows
  let shownUrl = "";
  let pending = 0; // bumps on every base change, so a late MapLibre load cannot undo a newer one
  let radar: L.TileLayer | null = null;
  // The vector map sits in its own pane under the tile pane, so radar tiles stay above it.
  map.createPane("vector-base").style.zIndex = "150";

  function applyLabels() {
    if (!gl) return;
    for (const layer of gl.getStyle().layers) {
      const kind = (Object.keys(LABEL_LAYERS) as LabelKind[]).find((k) => LABEL_LAYERS[k].test(layer.id));
      if (kind) gl.setLayoutProperty(layer.id, "visibility", saved.labels[kind] ? "visible" : "none");
    }
  }

  function showTiles(b: (typeof BASES)[BaseId]) {
    shownUrl = b.url;
    const tiles = L.tileLayer(b.url, { maxZoom: b.maxZoom, maxNativeZoom: b.maxZoom, attribution: b.attribution, className: b.className }).addTo(map);
    tiles.bringToBack();
    base = tiles;
  }

  function setBase(id: BaseId) {
    const b = BASES[id];
    const mine = ++pending;
    base.remove();
    gl = null;
    if (id === "map") {
      shownUrl = protomapsStyle(saved.flavor);
      Promise.all([import("./vectorMap"), loadStyle(shownUrl)]).then(
        ([{ maplibreGL }, style]) => {
          if (mine !== pending) return;
          const layer = maplibreGL({ style, pane: "vector-base" } as L.LeafletMaplibreGLOptions).addTo(map);
          gl = layer.getMaplibreMap();
          gl.on("style.load", applyLabels);
          base = layer;
        },
        () => mine === pending && showTiles(b), // no extract here, or offline before MapLibre loaded: OSM
      );
    } else showTiles(b);
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
    if (saved.base === "map" && shownUrl.startsWith(PROTOMAPS) && protomapsStyle(saved.flavor) !== shownUrl) setBase("map");
  }).observe(document.documentElement, { attributeFilter: ["data-theme"] });

  // Map style and label switches on the settings page: not trip settings, so the settings form
  // must not plan again.
  const flavor = labels.querySelector<HTMLSelectElement>("select[name=map-flavor]")!;
  flavor.value = saved.flavor;
  for (const box of labels.querySelectorAll<HTMLInputElement>("input[name=map-label]")) box.checked = saved.labels[box.value as LabelKind];
  labels.addEventListener("input", (e) => {
    e.stopPropagation();
    if (e.target === flavor) {
      saved.flavor = flavor.value;
      save(saved);
      if (saved.base === "map") setBase("map");
      return;
    }
    const box = e.target as HTMLInputElement;
    saved.labels[box.value as LabelKind] = box.checked;
    save(saved);
    applyLabels();
  });

  setBase(saved.base);
  if (saved.radar) void setRadar(true);
}

// The chosen layers are a per-viewer convenience; storage may be blocked.
function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    const labels = { ...DEFAULT_LABELS };
    for (const k of Object.keys(labels) as LabelKind[]) if (typeof v.labels?.[k] === "boolean") labels[k] = v.labels[k];
    return { base: v.base in BASES ? v.base : "map", radar: v.radar === true, labels, flavor: FLAVORS.includes(v.flavor) ? v.flavor : "auto" };
  } catch {
    return { base: "map", radar: false, labels: { ...DEFAULT_LABELS }, flavor: "auto" };
  }
}

function save(v: Saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch {
    // not remembered
  }
}
