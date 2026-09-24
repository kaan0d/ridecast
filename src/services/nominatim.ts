import { type LatLon } from "../core/geo";
import { getJson, isCached } from "./http";

const BASE = "https://nominatim.openstreetmap.org";
const MIN_INTERVAL_MS = 1100; // Nominatim policy: max 1 request per second

let queue: Promise<unknown> = Promise.resolve();

// Runs network requests one after another with a gap; cached URLs skip the queue.
function throttled<T>(url: string): Promise<T> {
  if (isCached(url)) return getJson<T>(url);
  const run = queue.then(() => getJson<T>(url));
  queue = run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, MIN_INTERVAL_MS)));
  return run;
}

// Returns null when there is no address for the point or the request fails.
export async function reverseLabel(pos: LatLon): Promise<string | null> {
  const url = `${BASE}/reverse?format=jsonv2&accept-language=tr&zoom=16&lat=${pos.lat.toFixed(5)}&lon=${pos.lon.toFixed(5)}`;
  try {
    const r = await throttled<{ display_name?: string }>(url);
    return r.display_name ?? null;
  } catch {
    return null;
  }
}
