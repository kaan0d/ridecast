import { ROAD_TYPE_RULES } from "../config/vehicles";
import { buildTimeline, type Timeline } from "../core/eta/eta";
import { type LatLon } from "../core/geo";
import { roadBreakdown } from "../core/route/roadType";
import { reverseLabel } from "../services/nominatim";
import { getRoutes, type Route } from "../services/osrm";
import { createMap, type StopKind } from "./map";
import { placeInput } from "./search";
import { bindSettings } from "./settings";

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
  let routedTitles: string[] = []; // titles of the stops the current routes pass through
  let selected = 0;
  let routeSeq = 0;

  const stopsEl = $("stops");
  const routesEl = $("routes");
  const statusEl = $("status");
  const summaryEl = $("summary");
  const map = createMap($("map"), onMapClick);
  const readSettings = bindSettings(renderRoutes);

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
    const settings = readSettings();
    const timelines = typeof settings === "string" ? null : routes.map((r) => buildTimeline(r.steps, settings.departMs, settings.speed));
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
        info.textContent = `${formatKm(r.distanceM)} · ${timelines ? formatDuration(totalS(timelines[i])) : "–"}`;
        b.append(name, info);
        b.addEventListener("click", () => selectRoute(i));
        li.append(b);
        return li;
      }),
    );
    if (typeof settings === "string") return renderSummary([["", settings]], true);
    const t = timelines?.[selected];
    if (!t) return renderSummary([]);
    const rows: [string, string][] = [
      ["Toplam süre", formatDuration(totalS(t))],
      ["Çıkış", formatTime(t.timeMs[0])],
      ...t.legArrivalMs.map((ms, i): [string, string] => [`${routedTitles[i + 1]} varış`, formatTime(ms)]),
    ];
    if (settings.speed.mode === "road") {
      const b = roadBreakdown(routes[selected].steps, ROAD_TYPE_RULES);
      const parts: [string, number][] = [
        ["Otoyol", b.motorway],
        ["Ana yol", b.primary],
        ["Şehir içi", b.urban],
        ["Feribot", b.ferry],
      ];
      const text = parts.filter(([, m]) => m > 0).map(([n, m]) => `${n} ${formatKm(m)}`);
      rows.push(["Yol tipi (tahmin)", text.join(" · ")]);
    }
    renderSummary(rows);
  }

  function renderSummary(rows: [string, string][], error = false) {
    const dl = document.createElement("dl");
    for (const [k, v] of rows) {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      dl.append(dt, dd);
    }
    dl.classList.toggle("error", error);
    summaryEl.replaceChildren(...(rows.length ? [dl] : []));
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
    const routed = stops.flatMap((s, i) => (s.pos ? [{ pos: s.pos, title: titleOf(i) }] : []));
    try {
      const result = await getRoutes(routed.map((s) => s.pos));
      if (my !== routeSeq) return;
      routes = result;
      routedTitles = routed.map((s) => s.title);
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

const totalS = (t: Timeline) => (t.timeMs[t.timeMs.length - 1] - t.timeMs[0]) / 1000;

const timeFormat = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", weekday: "short", hour: "2-digit", minute: "2-digit" });
const formatTime = (ms: number) => timeFormat.format(ms);

function formatDuration(s: number) {
  const min = Math.round(s / 60);
  const h = Math.floor(min / 60);
  return h ? `${h} sa ${min % 60} dk` : `${min} dk`;
}

const formatCoord = (p: LatLon) => `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
