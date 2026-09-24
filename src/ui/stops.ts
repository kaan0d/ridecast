import { t } from "../i18n";
import { STOPS } from "../config/stops";
import { pickStops, type Poi, type StopOnRoute } from "../core/advice/stops";
import { etaAtDistance, type Timeline } from "../core/eta/eta";
import type { LatLon } from "../core/geo";
import { haversineM, segmentBoxes, snapToLine, type Line } from "../core/route/line";
import { fetchStops } from "../services/overpass";
import type { Route } from "../services/osrm";
import { formatClock } from "./format";
import { icons } from "./icons";
import type { createMap } from "./map";
import type { WeatherPoint } from "./weather";

const KIND = t.stops.kind;
const nameOf = (s: StopOnRoute) => (s.named ? s.name : KIND[s.kind]);

export const stopIcon = (s: StopOnRoute) => (s.kind === "fuel" ? icons.fuel : icons.rest);

export function stopPin(s: StopOnRoute): string {
  return `<span class="stop-pin${s.recommended ? " recommended" : ""}">${stopIcon(s)}</span>`;
}

// List of stops along the route, each with an "add as break" action.
export function renderStops(
  el: HTMLElement,
  state: { stops: StopOnRoute[] | null; loading: boolean; error?: string; etaAt(distM: number): number | null; onLoad(): void; onAdd(s: StopOnRoute): void; onOpen(i: number): void },
) {
  const parts: HTMLElement[] = [];
  if (!state.stops) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "button-secondary stops-load";
    b.textContent = state.loading ? t.stops.searching : t.stops.show;
    b.disabled = state.loading;
    b.addEventListener("click", state.onLoad);
    parts.push(b);
  }
  if (state.error) {
    const p = document.createElement("p");
    p.className = "footnote error-text";
    p.textContent = state.error;
    parts.push(p);
  }
  if (state.stops) {
    const list = document.createElement("ol");
    list.className = "stop-list";
    if (!state.stops.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = t.stops.none;
      list.append(li);
    }
    state.stops.forEach((s, i) => {
      const li = document.createElement("li");
      const open = document.createElement("button");
      open.type = "button";
      open.className = "stop-open";
      const eta = state.etaAt(s.distM);
      open.innerHTML = `${stopIcon(s)}<span class="stop-name"></span><span class="stop-meta"></span>`;
      open.querySelector(".stop-name")!.textContent = nameOf(s);
      open.querySelector(".stop-meta")!.textContent =
        `${s.named ? KIND[s.kind] + " · " : ""}${t.km(Math.round(s.distM / 1000))}${eta ? " · " + formatClock(eta) : ""}${s.recommended ? t.stops.sheltered : ""}`;
      open.addEventListener("click", () => state.onOpen(i));
      const add = document.createElement("button");
      add.type = "button";
      add.className = "icon-btn";
      add.innerHTML = icons.plus;
      add.setAttribute("aria-label", t.stops.addAria(nameOf(s)));
      add.title = t.stops.addBreak;
      add.addEventListener("click", () => state.onAdd(s));
      li.classList.toggle("recommended", s.recommended);
      li.append(open, add);
      list.append(li);
    });
    parts.push(list);
    const note = document.createElement("p");
    note.className = "footnote";
    note.textContent = t.stops.note;
    parts.push(note);
  }
  el.replaceChildren(...parts);
}

interface PanelDeps {
  map: ReturnType<typeof createMap>;
  // The selected route, or null without one.
  route(): { route: Route; line: Line; scale: number; timeline: Timeline | null; points: WeatherPoint[] } | null;
  onAdd(pos: LatLon): void; // add a break at the stop
  onOpen(): void; // before a stop is shown on the map (collapse the sheet)
}

// "Fuel and rest stops": Overpass stops of the selected route, loaded on request.
export function createStopsPanel(deps: PanelDeps) {
  const panel = document.getElementById("stops-panel")!;
  // Stops found for one route (by route object), loaded on request.
  let state: { route: Route; pois: Poi[] | null; loading: boolean; error?: string } | null = null;
  let shown: StopOnRoute[] = [];

  async function load() {
    const sel = deps.route();
    if (!sel) return;
    const { route } = sel;
    state = { route, pois: null, loading: true };
    render();
    try {
      const pois = await fetchStops(segmentBoxes(sel.line, STOPS.boxSegmentM, STOPS.boxPadDeg));
      if (state?.route !== route) return;
      state = { route, pois, loading: false };
    } catch (e) {
      if (state?.route !== route) return;
      state = { route, pois: null, loading: false, error: (e as Error).message };
    }
    render();
  }

  // Stops of the selected route with km, ETA and the shelter recommendation from the weather points.
  function render() {
    const sel = deps.route();
    const mine = sel && state && state.route === sel.route ? state : null;
    const badAt = (d: number) => {
      const points = sel?.points ?? [];
      if (!points.length) return false;
      const p = points.reduce((a, b) => (Math.abs(b.distM - d) < Math.abs(a.distM - d) ? b : a));
      const r = p.risk;
      return !!r && (r.events.some((e) => e.kind === "rain" || e.kind === "snow" || e.kind === "storm") || r.feltC <= STOPS.badFeltC);
    };
    shown =
      sel && mine?.pois
        ? pickStops(
            mine.pois.flatMap((p) => {
              const s = snapToLine(sel.line, p.pos);
              return haversineM(s.pos, p.pos) <= STOPS.corridorM ? [{ ...p, distM: s.distM * sel.scale }] : [];
            }),
            badAt,
            STOPS.minGapM,
          )
        : [];
    const add = (s: StopOnRoute) => {
      deps.map.closePopup();
      deps.onAdd(s.pos);
    };
    deps.map.setPois(
      shown.map((s) => ({
        pos: s.pos,
        pin: stopPin(s),
        popup: () => {
          const div = document.createElement("div");
          div.className = "poi-card";
          const name = document.createElement("strong");
          name.textContent = nameOf(s);
          const meta = document.createElement("span");
          meta.textContent = `${t.km(Math.round(s.distM / 1000))}${s.recommended ? t.stops.shelteredShort : ""}`;
          const b = document.createElement("button");
          b.type = "button";
          b.className = "button-secondary";
          b.textContent = t.stops.addBreak;
          b.addEventListener("click", () => add(s));
          div.append(name, meta, b);
          return div;
        },
      })),
    );
    document.getElementById("stops-section")!.hidden = !sel;
    if (!sel) return panel.replaceChildren();
    const tl = sel.timeline;
    renderStops(panel, {
      stops: mine?.pois ? shown : null,
      loading: !!mine?.loading,
      error: mine?.error,
      etaAt: (d) => (tl ? etaAtDistance(tl, d) : null),
      onLoad: load,
      onAdd: add,
      onOpen: (i) => {
        deps.onOpen();
        deps.map.openPoi(i);
      },
    });
  }

  return { render, reset: () => (state = null) };
}
