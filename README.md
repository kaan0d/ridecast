# ridecast

Rota hava durumu: a motorcycle-focused web app that shows weather, risks and warnings along a route, based on the time you reach each point. Turkish UI, map-first layout that works like a phone app (bottom sheet on phones, floating card on desktop), system light and dark themes.

## Status

| Stage | Content | State |
|---|---|---|
| 1 | Map, address search, route + alternatives | done |
| 2 | Vehicle type, speed, departure time, ETA | done |
| 3 | Breaks | done |
| 4 | Open-Meteo weather along the route | done |
| 5 | Risk score and warnings | planned |
| 6 | Safest route | planned |
| 7 | Best departure time | planned |
| 8 | Clothing advice, fuel/rest stops | planned |
| 9 | Share link, saved routes | planned |
| 10 | Live mode (GPS) | planned |

## Setup

Requires Node 22+.

```
npm install
npm run dev      # dev server
npm run build    # type check + production build
npm run test     # Vitest (src/core)
```

## Usage

- Type an address in Başlangıç / Bitiş and pick a suggestion, or click the map: a click fills the first empty stop, otherwise adds a via stop before the end.
- "+ Ara durak" adds an empty via stop; "×" removes it.
- "Konumumu kullan" sets the start to the current GPS position.
- The route is fetched as soon as start and end are set. Alternatives are drawn in grey; click one on the map or in the panel to select it.
- Araç: motorcycle (default), car, bicycle, walking. Changing it resets the speeds to that vehicle's defaults (`src/config/vehicles.ts`).
- Hız: one average speed, or "Yol tipine göre" with separate motorway / main road / urban speeds. All values are editable (1-250 km/h).
- Çıkış: now, or a date and time. The panel shows total time, departure, the arrival at each via stop and at the end, and in road mode the km per guessed road type.
- Hava: the selected route is sampled about every 15 min of driving (at most 30 points, start and end included). Each point shows the forecast hour nearest to your arrival there, as a capsule on the map (thinned out when zoomed out) and in the "Yol boyunca hava" strip. Tapping either opens a card: arrival time, km, temperature and feels-like, condition, precipitation (mm and %), snow, wind speed, direction and gusts, visibility, and which forecast hour was used. Night hours show a moon.
- Molalar: click the selected route to add a break there (snapped to the route, 15 min by default). Drag its marker along the route to move it, change its minutes (5/10/15/30/60 suggested, any 1-600 allowed) or remove it in the list. "Otomatik mola ekle" places breaks every N km or every N minutes of riding; running it again replaces the automatic breaks that were not edited. Each break shows its km and start/end time, and every later arrival moves by its duration.

## Layout

```
src/config/    vehicle defaults, road type rules (all tunable numbers)
src/core/      pure TypeScript, no DOM/fetch: coordinates, route geometry (snap, distance), road type guess, ETA timeline with breaks, weather sampling, forecast hour matching, WMO codes
src/services/  Nominatim, OSRM, Open-Meteo clients + in-memory request cache
src/ui/        Leaflet map, address inputs, panel
```

## Tested

- `npm run build`: passes (tsc strict, Vite build).
- `npm run test`: 14 tests pass (coordinate conversions; route geometry: haversine, snapping, point at distance; road type guess and breakdown; ETA with average speed, road speeds, ferry steps, leg arrivals, interpolation and clamping; breaks: later times shift by the break, earlier ones do not, sorting, break at a stop, breaks past the end, automatic breaks by km and by riding minutes).
- Now 20 tests: stage 4 adds weather sampling (spacing, cap, short routes), nearest forecast hour (closest, out of range), WMO code labels and compass names.
- Stage 2 manually in Chrome, Kadıköy to Eskişehir (273 km): average 80 km/h gives 3 h 25 min; road mode with motorcycle speeds (110/80/40) gives 3 h 47 min for 98 km motorway, 119 km main road, 56 km urban, which matches the hand calculation. Car defaults: 3 h 23 min. A via stop in Bursa shows its own arrival time. Speed 0 shows an error instead of times. Fixed departure 25 Sep 08:00 gives arrival 11:23.
- Stage 3 manually in Chrome, same route at 80 km/h from 08:00: no breaks 3 h 25 min. A click on the route at km 107 adds a 15 min break from 09:20 (107 km at 80 km/h = 80 min), total 3 h 40 min; changing it to 30 min gives 3 h 55 min. Automatic breaks every 100 km, 10 min, add breaks at km 100 (09:15) and km 200, total 4 h 15 min. Dragging a marker moved it from km 200 to km 221 and kept it on the route. Removing one break takes its time back off. Switching to the alternative and back puts the breaks back where they were.
- Stage 4 manually in Chrome, same route, departure 24 Sep 08:00: 15 sample points from 08:00 (km 0) to 11:24 (km 273). The first point's 15° matches the raw Open-Meteo value for its rounded coordinate (41.00, 29.00) at 08:00, 14.5°. The card for km 117 (arrival 09:27) uses the 09:00 forecast hour. Departing at night shows moon icons. With Open-Meteo blocked the strip shows "Hava durumu alınamadı." and a retry button, and the retry loads the data. Phone width (390 px): the map shows 7 of the 15 capsules at the fitted zoom so the route stays visible.
- Manually in Chrome: address search suggestions, pick start, map click for end, reverse-geocoded label, route with one alternative (Kadıköy to Eskişehir area: 359 km / 386 km), switching the selected route, OSRM network failure shows an error message.

## Limits

- Services are public demo/free servers, meant for development and light use only: OSRM demo server, Nominatim (max 1 request/s, enforced client side with a queue and 600 ms debounce).
- OSRM demo only has the car profile. Other vehicle types will change speed and thresholds, not the route.
- OSRM returns alternatives only when there are exactly two stops.
- OSRM snaps any point to the nearest road (even across ferries), so "route not found" is rare.
- Road type is a guess: Turkish refs (O-x motorway, D-x main road) first, else the OSRM step average speed (>= 90 km/h motorway, >= 70 main road). Fast provincial roads without a ref can count as urban.
- Ferry steps keep the OSRM duration, whatever the vehicle speed.
- ETA uses constant speeds per road type; no traffic.
- Weather points are rounded to 0.05° (~5 km) so ETA-only changes reuse the cached forecast; the forecast is for that grid point, not the exact road.
- Open-Meteo covers about 15 days ahead. A request that takes longer than 15 s counts as failed (retry button).
- Day or night comes from Open-Meteo's is_day. Sunrise, sunset and dark-riding warnings come in stage 5.
- Map tiles are OSM standard tiles muted with CSS filters; keyless muted basemaps (CARTO) now watermark browser requests. OSM tiles are for light use only.
- Breaks are stored as map points. On another route (alternative, or new stops) they snap to its nearest point, which can be far from where they were meant to be.
