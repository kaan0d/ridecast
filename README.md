# ridecast

Rota Hava Durumu: a motorcycle-focused web app that shows weather, risks and warnings along a route, based on the time you reach each point. Turkish UI.

## Status

| Stage | Content | State |
|---|---|---|
| 1 | Map, address search, route + alternatives | done |
| 2 | Vehicle type, speed, departure time, ETA | done |
| 3 | Breaks | planned |
| 4 | Open-Meteo weather along the route | planned |
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

## Layout

```
src/config/    vehicle defaults, road type rules (all tunable numbers)
src/core/      pure TypeScript, no DOM/fetch: coordinates, road type guess, ETA timeline
src/services/  Nominatim, OSRM clients + in-memory request cache
src/ui/        Leaflet map, address inputs, panel
```

## Tested

- `npm run build`: passes (tsc strict, Vite build).
- `npm run test`: 7 tests pass (coordinate conversions; road type guess and breakdown; ETA with average speed, road speeds, ferry steps, leg arrivals, interpolation and clamping).
- Stage 2 manually in Chrome, Kadıköy to Eskişehir (273 km): average 80 km/h gives 3 h 25 min; road mode with motorcycle speeds (110/80/40) gives 3 h 47 min for 98 km motorway, 119 km main road, 56 km urban, which matches the hand calculation. Car defaults: 3 h 23 min. A via stop in Bursa shows its own arrival time. Speed 0 shows an error instead of times. Fixed departure 25 Sep 08:00 gives arrival 11:23.
- Manually in Chrome: address search suggestions, pick start, map click for end, reverse-geocoded label, route with one alternative (Kadıköy to Eskişehir area: 359 km / 386 km), switching the selected route, OSRM network failure shows an error message.

## Limits

- Services are public demo/free servers, meant for development and light use only: OSRM demo server, Nominatim (max 1 request/s, enforced client side with a queue and 600 ms debounce).
- OSRM demo only has the car profile. Other vehicle types will change speed and thresholds, not the route.
- OSRM returns alternatives only when there are exactly two stops.
- OSRM snaps any point to the nearest road (even across ferries), so "route not found" is rare.
- Road type is a guess: Turkish refs (O-x motorway, D-x main road) first, else the OSRM step average speed (>= 90 km/h motorway, >= 70 main road). Fast provincial roads without a ref can count as urban.
- Ferry steps keep the OSRM duration, whatever the vehicle speed.
- ETA uses constant speeds per road type; no traffic, no breaks yet (stage 3).
