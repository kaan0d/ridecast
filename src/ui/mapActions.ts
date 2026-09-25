import { t } from "../i18n";
import type { LatLon } from "../core/geo";
import { formatCoord } from "./format";
import type { createMap } from "./map";
import type { createMeasure } from "./measure";
import { closeMenu, openMenu, type MenuItem } from "./menu";
import { placeCard } from "./place";

interface Deps {
  map: ReturnType<typeof createMap>;
  measure: ReturnType<typeof createMeasure>;
  status(text: string, kind?: "info" | "error" | "loading"): void;
  setStart(pos: LatLon, label?: string): void; // label: fixed text instead of a looked-up address
  setEnd(pos: LatLon): void;
  addStop(pos: LatLon): void;
  canAddBreak(): boolean; // only with a route
  addBreak(pos: LatLon): void; // snapped to the selected route
  hasStart(): boolean;
  isLive(): boolean; // a ride is on: the menu only adds stops
  focusNextAddress(): void;
}

// What the map does on its own: the right-click (long-press) menu and its place card, "my
// location" and the keyboard shortcuts, all like Google Maps. A plain click drops no pin.
export function bindMapActions(deps: Deps) {
  const { map, measure } = deps;

  const tripActions = (pos: LatLon) => [
    { label: t.place.from, run: () => (map.closePopup(), deps.setStart(pos)) },
    { label: t.place.to, primary: true, run: () => (map.closePopup(), deps.setEnd(pos)) },
    { label: t.place.addStop, run: () => (map.closePopup(), deps.addStop(pos)) },
  ];

  function openPlace(pos: LatLon) {
    closeMenu();
    map.openPlace(pos, placeCard(pos, tripActions(pos)));
  }

  function openContext(pos: LatLon, x: number, y: number) {
    map.closePopup();
    if (deps.isLive()) return openMenu(x, y, [{ label: t.menu.addStop, action: () => deps.addStop(pos) }], t.menu.label);
    const coord = formatCoord(pos);
    const items: MenuItem[] = [
      { label: coord, hint: t.menu.copy, action: () => void navigator.clipboard?.writeText(coord).then(() => deps.status(t.menu.copied), () => deps.status(coord)) },
      { label: t.menu.from, action: () => deps.setStart(pos) },
      { label: t.menu.to, action: () => deps.setEnd(pos) },
      { label: t.menu.addStop, action: () => deps.addStop(pos) },
    ];
    if (deps.canAddBreak()) items.push({ label: t.menu.addBreak, hint: t.menu.onRoute, action: () => deps.addBreak(pos) });
    items.push({ label: t.menu.whatsHere, action: () => openPlace(pos) }, { label: t.menu.measure, action: () => measure.start(pos) });
    openMenu(x, y, items, t.menu.label);
  }

  // "Show my location": centre on the device and show a dot (tap it for the place card).
  // With no start yet, the position also becomes the start.
  function locate() {
    if (!navigator.geolocation) return deps.status(t.menu.noGeo, "error");
    deps.status(t.menu.locating, "loading");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lon: p.coords.longitude };
        deps.status("");
        map.showMe(pos, () => openPlace(pos));
        if (!deps.hasStart()) deps.setStart(pos, t.app.myLocation);
      },
      (err) => deps.status(err.code === err.PERMISSION_DENIED ? t.menu.denied : t.menu.failed, "error"),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  // Shortcuts: Escape closes the menu, card and measuring; "/" jumps to the next address field.
  addEventListener("keydown", (e) => {
    const typing = (e.target as Element).closest?.("input, select, textarea");
    if (e.key === "Escape") {
      closeMenu();
      map.closePopup();
      if (measure.isActive()) measure.stop();
    } else if (e.key === "/" && !typing) {
      e.preventDefault();
      deps.focusNextAddress();
    }
  });

  return {
    onClick: (pos: LatLon) => measure.isActive() && measure.add(pos),
    onContext: openContext,
    locate,
    openPlace,
  };
}
