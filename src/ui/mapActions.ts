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
  focusNextAddress(): void;
}

// What the map does on its own: place card on a click, the right-click menu, "my location" and
// the keyboard shortcuts, all like Google Maps.
export function bindMapActions(deps: Deps) {
  const { map, measure } = deps;

  const tripActions = (pos: LatLon) => [
    { label: "Buradan", run: () => (map.closePopup(), deps.setStart(pos)) },
    { label: "Buraya", primary: true, run: () => (map.closePopup(), deps.setEnd(pos)) },
    { label: "Durak ekle", run: () => (map.closePopup(), deps.addStop(pos)) },
  ];

  function openPlace(pos: LatLon) {
    closeMenu();
    map.openPlace(pos, placeCard(pos, tripActions(pos)));
  }

  function openContext(pos: LatLon, x: number, y: number) {
    map.closePopup();
    const coord = formatCoord(pos);
    const items: MenuItem[] = [
      { label: coord, hint: "Kopyala", action: () => void navigator.clipboard?.writeText(coord).then(() => deps.status("Koordinat kopyalandı."), () => deps.status(coord)) },
      { label: "Buradan yol tarifi", action: () => deps.setStart(pos) },
      { label: "Buraya yol tarifi", action: () => deps.setEnd(pos) },
      { label: "Durak ekle", action: () => deps.addStop(pos) },
    ];
    if (deps.canAddBreak()) items.push({ label: "Buraya mola ekle", hint: "rotada", action: () => deps.addBreak(pos) });
    items.push({ label: "Burada ne var?", action: () => openPlace(pos) }, { label: "Mesafe ölç", action: () => measure.start(pos) });
    openMenu(x, y, items, "Harita menüsü");
  }

  // "Konumumu göster": centre on the device and show a dot (tap it for the place card).
  // With no start yet, the position also becomes the start.
  function locate() {
    if (!navigator.geolocation) return deps.status("Tarayıcınız konum özelliğini desteklemiyor.", "error");
    deps.status("Konum alınıyor…", "loading");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lon: p.coords.longitude };
        deps.status("");
        map.showMe(pos, () => openPlace(pos));
        if (!deps.hasStart()) deps.setStart(pos, "Konumum");
      },
      (err) => deps.status(err.code === err.PERMISSION_DENIED ? "Konum izni reddedildi." : "Konum alınamadı.", "error"),
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
    onClick: (pos: LatLon) => (measure.isActive() ? measure.add(pos) : openPlace(pos)),
    onContext: openContext,
    locate,
    openPlace,
  };
}
