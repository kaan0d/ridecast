import { BREAK_LIMITS_MIN } from "../config/breaks";
import { SHARE } from "../config/share";
import { SPEED_LIMITS_KMH } from "../config/vehicles";
import { addRecent, parseRecent, type RecentRoute } from "../core/share/recent";
import { decodeState, encodeState, type TripState } from "../core/share/state";
import { formatDay } from "./format";

interface Deps {
  current(): TripState | null; // the trip as set now, null while incomplete
  hasRoute(): boolean;
  apply(s: TripState): void;
  error(text: string): void;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Share link in the URL hash, "Linki kopyala", and the recent routes list.
export function bindShare(deps: Deps) {
  // Keeps the address bar in step with the trip, so a reload or a copied URL restores it.
  function sync() {
    const s = deps.current();
    const hash = s ? "#" + encodeState(s) : "";
    if (location.hash !== hash) history.replaceState(null, "", hash || location.pathname + location.search);
    $("share").hidden = !s || !deps.hasRoute();
  }

  function applyHash(): boolean {
    if (!location.hash) return false;
    const s = decodeState(location.hash, {
      minKmh: SPEED_LIMITS_KMH.min,
      maxKmh: SPEED_LIMITS_KMH.max,
      minBreak: BREAK_LIMITS_MIN.min,
      maxBreak: BREAK_LIMITS_MIN.max,
    });
    if (!s) {
      deps.error("Bu link okunamadı; rota yüklenmedi.");
      sync(); // put the current trip back in the address bar
      return false;
    }
    deps.apply(s);
    return true;
  }

  // Browser storage can be missing or blocked (private mode); the app works without it.
  function loadRecent(): RecentRoute[] {
    try {
      return parseRecent(localStorage.getItem(SHARE.storageKey));
    } catch {
      return [];
    }
  }

  function saveRecent() {
    const s = deps.current();
    if (!s) return;
    const first = s.stops[0].label.split(",")[0] || "Başlangıç";
    const last = s.stops[s.stops.length - 1].label.split(",")[0] || "Bitiş";
    const entry: RecentRoute = {
      key: s.stops.map((x) => `${x.lat.toFixed(4)},${x.lon.toFixed(4)}`).join(";"),
      title: `${first} → ${last}`,
      hash: encodeState(s),
      savedMs: Date.now(),
    };
    try {
      localStorage.setItem(SHARE.storageKey, JSON.stringify(addRecent(loadRecent(), entry, SHARE.maxRecent)));
    } catch {
      // not saved; nothing else depends on it
    }
    renderRecent();
  }

  function renderRecent() {
    const el = $("recent");
    const list = deps.hasRoute() ? [] : loadRecent();
    if (!list.length) return el.replaceChildren();
    const title = document.createElement("h2");
    title.className = "group-title";
    title.textContent = "Son rotalar";
    const ol = document.createElement("ol");
    ol.className = "group recent-list";
    for (const r of list) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "recent-item";
      const t = document.createElement("span");
      t.textContent = r.title;
      const d = document.createElement("span");
      d.className = "recent-date";
      d.textContent = formatDay(r.savedMs);
      b.append(t, d);
      b.addEventListener("click", () => {
        history.replaceState(null, "", "#" + r.hash);
        applyHash();
      });
      li.append(b);
      ol.append(li);
    }
    el.replaceChildren(title, ol);
  }

  $("copy-link").addEventListener("click", async () => {
    sync();
    const note = $("copy-status");
    try {
      // A clipboard request can hang (e.g. waiting on a permission prompt); fall back after a moment.
      await Promise.race([
        navigator.clipboard.writeText(location.href),
        new Promise((_, reject) => setTimeout(() => reject(new Error("clipboard timeout")), SHARE.clipboardTimeoutMs)),
      ]);
      note.textContent = "Kopyalandı";
    } catch {
      // Clipboard can be blocked; show the link selected so it can be copied by hand.
      const field = document.createElement("input");
      field.readOnly = true;
      field.className = "copy-field";
      field.value = location.href;
      field.setAttribute("aria-label", "Paylaşım linki");
      note.replaceChildren(field);
      field.select();
      return;
    }
    setTimeout(() => (note.textContent = ""), 2500);
  });

  addEventListener("hashchange", () => applyHash());

  return { sync, applyHash, saveRecent, renderRecent };
}
