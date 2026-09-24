import { CHANGES } from "../config/share";
import { diffWarnings, type WarningChange, type WarningSnap } from "../core/advice/changes";
import { formatDuration, formatTime } from "./format";
import { LEVEL_LABEL, type Warning } from "./weather";

interface Snapshot {
  savedMs: number;
  runs: WarningSnap[]; // startMs relative to the departure, so "now" trips compare too
}

const km = (m: number) => `km ${Math.round(m / 1000)}`;

function describe(c: WarningChange): string {
  switch (c.type) {
    case "new":
      return `Yeni: ${c.now.text} (${km(c.now.fromM)})`;
    case "gone":
      return `Artık yok: ${c.before.text} (${km(c.before.fromM)})`;
    case "level":
      return `${c.now.text}: ${LEVEL_LABEL[c.before.level].toLowerCase()} → ${LEVEL_LABEL[c.now.level].toLowerCase()} (${km(c.now.fromM)})`;
    case "moved": {
      const when = Math.abs(c.shiftMs) >= CHANGES.minShiftMs ? ` ${formatDuration(Math.abs(c.shiftMs) / 1000)} ${c.shiftMs < 0 ? "daha erken" : "daha geç"}` : "";
      const where = Math.abs(c.shiftM) >= CHANGES.minShiftM ? `: artık ${km(c.now.fromM)}, önce ${km(c.before.fromM)}` : ` (${km(c.now.fromM)})`;
      return `${c.now.text}${when} başlıyor${where}`;
    }
  }
}

// "Son bakıştan beri": each trip keeps the warnings of the last forecast in the browser; the first
// forecast after reopening it lists what changed. Only the first look of a page load compares,
// and only against a snapshot at least `minAgeMs` old, so edits in one session are not "changes".
export function bindChanges(el: HTMLElement) {
  const compared = new Set<string>();

  function load(): Record<string, Snapshot> {
    try {
      return JSON.parse(localStorage.getItem(CHANGES.storageKey) ?? "{}");
    } catch {
      return {};
    }
  }

  function save(all: Record<string, Snapshot>) {
    // Keep the most recently saved trips only.
    const keep = Object.entries(all)
      .sort((a, b) => b[1].savedMs - a[1].savedMs)
      .slice(0, CHANGES.maxTrips);
    try {
      localStorage.setItem(CHANGES.storageKey, JSON.stringify(Object.fromEntries(keep)));
    } catch {
      // not remembered
    }
  }

  function render(changes: WarningChange[], sinceMs: number) {
    const title = document.createElement("h2");
    title.className = "group-title";
    title.textContent = "Son bakıştan beri";
    const list = document.createElement("ul");
    list.className = "group change-list";
    for (const c of changes) {
      const li = document.createElement("li");
      li.textContent = describe(c);
      li.dataset.type = c.type;
      list.append(li);
    }
    const note = document.createElement("p");
    note.className = "footnote";
    note.textContent = `${formatTime(sinceMs)} tarihli tahmine göre. `;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "link-button";
    close.textContent = "Kapat";
    close.addEventListener("click", () => el.replaceChildren());
    note.append(close);
    el.replaceChildren(title, list, note);
  }

  return {
    // key: the trip as shared (stops, breaks, settings, route); departMs: its departure now.
    onForecast(key: string, departMs: number, warnings: Warning[]) {
      const runs = warnings.flatMap((w) => (w.run ? [{ ...w.run, startMs: w.run.startMs - departMs }] : []));
      const all = load();
      const before = all[key];
      if (!compared.has(key)) {
        compared.add(key);
        el.replaceChildren();
        if (before && Date.now() - before.savedMs >= CHANGES.minAgeMs) {
          const changes = diffWarnings(before.runs, runs, CHANGES);
          if (changes.length) render(changes, before.savedMs);
        }
      }
      all[key] = { savedMs: Date.now(), runs };
      save(all);
    },
    clear: () => el.replaceChildren(),
  };
}
