import { type LatLon } from "../core/geo";
import { reverseLabel } from "../services/nominatim";
import { getRoutes, type Route } from "../services/osrm";
import { createMap, type StopKind } from "./map";
import { placeInput } from "./search";

interface Stop {
  label: string;
  pos: LatLon | null;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function startApp() {
  const stops: Stop[] = [
    { label: "", pos: null },
    { label: "", pos: null },
  ];
  let routes: Route[] = [];
  let selected = 0;
  let routeSeq = 0;

  const stopsEl = $("stops");
  const routesEl = $("routes");
  const statusEl = $("status");
  const map = createMap($("map"), onMapClick);

  const kindOf = (i: number): StopKind => (i === 0 ? "start" : i === stops.length - 1 ? "end" : "via");
  const titleOf = (i: number) => ({ start: "Başlangıç", end: "Bitiş", via: `Ara durak ${i}` })[kindOf(i)];

  function status(text: string, kind: "info" | "error" | "loading" = "info") {
    statusEl.textContent = text;
    statusEl.dataset.kind = kind;
  }

  function renderStops() {
    stopsEl.replaceChildren(
      ...stops.map((s, i) => {
        const row = document.createElement("li");
        row.className = `stop-row stop-${kindOf(i)}`;
        const title = document.createElement("span");
        title.className = "stop-title";
        title.textContent = titleOf(i);
        row.append(title, placeInput(s.label, `${titleOf(i)} adresi`, (p) => setStop(i, p.label, p.pos)));
        if (kindOf(i) === "via") {
          const rm = document.createElement("button");
          rm.type = "button";
          rm.className = "icon-btn";
          rm.textContent = "×";
          rm.setAttribute("aria-label", `${titleOf(i)} sil`);
          rm.addEventListener("click", () => {
            stops.splice(i, 1);
            stopsChanged();
          });
          row.append(rm);
        }
        return row;
      }),
    );
    map.setStops(stops.flatMap((s, i) => (s.pos ? [{ pos: s.pos, kind: kindOf(i) }] : [])));
  }

  function selectRoute(i: number) {
    selected = i;
    renderRoutes();
  }

  function renderRoutes() {
    map.setRoutes(
      routes.map((r) => r.coords),
      selected,
      selectRoute,
    );
    routesEl.replaceChildren(
      ...routes.map((r, i) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        b.className = "route-item";
        b.setAttribute("aria-pressed", String(i === selected));
        const name = document.createElement("strong");
        name.textContent = i === 0 ? "Önerilen rota" : `Alternatif ${i}`;
        const info = document.createElement("span");
        info.textContent = `${formatKm(r.distanceM)} · ${formatDuration(r.durationS)}`;
        b.append(name, info);
        b.addEventListener("click", () => selectRoute(i));
        li.append(b);
        return li;
      }),
    );
  }

  function stopsChanged() {
    renderStops();
    updateRoute();
  }

  function setStop(i: number, label: string, pos: LatLon) {
    stops[i] = { label, pos };
    stopsChanged();
  }

  // Map click fills the first empty stop, else adds a via stop before the end.
  function onMapClick(pos: LatLon) {
    let i = stops.findIndex((s) => !s.pos);
    if (i < 0) {
      i = stops.length - 1;
      stops.splice(i, 0, { label: "", pos: null });
    }
    const target = { label: formatCoord(pos), pos };
    stops[i] = target;
    stopsChanged();
    labelLater(target);
  }

  async function labelLater(stop: Stop) {
    if (!stop.pos) return;
    const label = await reverseLabel(stop.pos);
    // Skip if the stop was replaced or removed meanwhile.
    if (label && stops.includes(stop)) {
      stop.label = label;
      renderStops();
    }
  }

  async function updateRoute() {
    const my = ++routeSeq;
    const start = stops[0].pos;
    const end = stops[stops.length - 1].pos;
    if (!start || !end) {
      routes = [];
      renderRoutes();
      status(start || end ? "Rota için başlangıç ve bitiş seçin." : "");
      return;
    }
    status("Rota hesaplanıyor…", "loading");
    try {
      const result = await getRoutes(stops.flatMap((s) => (s.pos ? [s.pos] : [])));
      if (my !== routeSeq) return;
      routes = result;
      selected = 0;
      renderRoutes();
      map.fit(result.flatMap((r) => r.coords));
      status("");
    } catch (e) {
      if (my !== routeSeq) return;
      routes = [];
      renderRoutes();
      status((e as Error).message, "error");
    }
  }

  $("add-via").addEventListener("click", () => {
    stops.splice(stops.length - 1, 0, { label: "", pos: null });
    renderStops();
    stopsEl.querySelectorAll("input")[stops.length - 2]?.focus();
  });

  $("locate").addEventListener("click", () => {
    if (!navigator.geolocation) return status("Tarayıcınız konum özelliğini desteklemiyor.", "error");
    status("Konum alınıyor…", "loading");
    navigator.geolocation.getCurrentPosition(
      (p) => setStop(0, "Konumum", { lat: p.coords.latitude, lon: p.coords.longitude }),
      (err) => status(err.code === err.PERMISSION_DENIED ? "Konum izni reddedildi." : "Konum alınamadı.", "error"),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });

  renderStops();
}

const formatKm = (m: number) => `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;

function formatDuration(s: number) {
  const min = Math.round(s / 60);
  const h = Math.floor(min / 60);
  return h ? `${h} sa ${min % 60} dk` : `${min} dk`;
}

const formatCoord = (p: LatLon) => `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
