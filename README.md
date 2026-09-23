# ridecast

Rota Hava Durumu: a motorcycle-focused web app that shows weather, risks and warnings along a route, based on the time you reach each point. Turkish UI.

## Status

| Stage | Content | State |
|---|---|---|
| 1 | Map, address search, route + alternatives | done |
| 2 | Vehicle type, speed, departure time, ETA | planned |
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

## Layout

```
src/core/      pure TypeScript, no DOM/fetch (coordinate conversion)
src/services/  Nominatim, OSRM clients + in-memory request cache
src/ui/        Leaflet map, address inputs, panel
```

## Tested

- `npm run build`: passes (tsc strict, Vite build).
- `npm run test`: 1 test (coordinate order conversions) passes.
- Manually in Chrome: address search suggestions, pick start, map click for end, reverse-geocoded label, route with one alternative (Kadıköy to Eskişehir area: 359 km / 386 km), switching the selected route, OSRM network failure shows an error message.

## Limits

- Services are public demo/free servers, meant for development and light use only: OSRM demo server, Nominatim (max 1 request/s, enforced client side with a queue and 600 ms debounce).
- OSRM demo only has the car profile. Other vehicle types will change speed and thresholds, not the route.
- OSRM returns alternatives only when there are exactly two stops.
- OSRM snaps any point to the nearest road (even across ferries), so "route not found" is rare.
