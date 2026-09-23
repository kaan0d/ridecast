// ponytail: unbounded in-memory cache for the page lifetime; add eviction if sessions get long.
const cache = new Map<string, Promise<unknown>>();

export const isCached = (url: string): boolean => cache.has(url);

export function getJson<T>(url: string, timeoutMs = 15000): Promise<T> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url, { signal: AbortSignal.timeout(timeoutMs) }).then(async (r) => {
      if (!r.ok) throw new HttpError(r.status);
      return r.json();
    });
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p as Promise<T>;
}

export class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}
