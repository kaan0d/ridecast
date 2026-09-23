export interface RecentRoute {
  key: string; // identifies the stops; the same trip saved again replaces the old entry
  title: string;
  hash: string;
  savedMs: number;
}

// Newest first, one entry per key, at most `max`.
export function addRecent(list: RecentRoute[], entry: RecentRoute, max: number): RecentRoute[] {
  return [entry, ...list.filter((r) => r.key !== entry.key)].slice(0, max);
}

// Reads a stored list, dropping anything that does not look like an entry.
export function parseRecent(raw: string | null): RecentRoute[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    if (!Array.isArray(v)) return [];
    return v.filter(
      (r) => r && typeof r.key === "string" && typeof r.title === "string" && typeof r.hash === "string" && typeof r.savedMs === "number",
    );
  } catch {
    return [];
  }
}
