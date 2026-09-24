// ridecast service worker, written by hand (no build plugin).
// - App shell: index.html and the hashed files it links, cached at install; network first for the
//   page (so a deploy shows up), cache first for /assets/ (hashed names never change).
// - Trip data: the last routes (OSRM, FOSSGIS, Valhalla) and Open-Meteo forecasts, network first with the cached copy
//   as the fallback, so a trip reopened without signal still shows its route and weather.
// - Map tiles are not cached here (tile policies forbid prefetching); the browser cache applies.
const SHELL = "ridecast-shell-v2";
const DATA = "ridecast-data-v1";
const DATA_HOSTS = ["router.project-osrm.org", "routing.openstreetmap.de", "valhalla1.openstreetmap.de", "api.open-meteo.com"];
const MAX_DATA = 40; // ponytail: oldest-first trim by insertion order; fine for a few trips

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      const html = await (await fetch("./", { cache: "no-cache" })).text();
      const files = [...html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)].map((m) => "./" + m[1]);
      await cache.addAll(["./", ...files]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== SHELL && key !== DATA) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request, cacheName, trim) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      if (trim) {
        const keys = await cache.keys();
        for (const k of keys.slice(0, Math.max(0, keys.length - MAX_DATA))) await cache.delete(k);
      }
    }
    return response;
  } catch (e) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    if (request.mode === "navigate") {
      event.respondWith(networkFirst(request, SHELL, false).catch(() => caches.match("./")));
    } else if (url.pathname.includes("/assets/")) {
      event.respondWith(caches.match(request).then((hit) => hit || networkFirst(request, SHELL, false)));
    }
    return;
  }
  if (DATA_HOSTS.includes(url.hostname)) event.respondWith(networkFirst(request, DATA, true));
});
