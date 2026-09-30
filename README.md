# ridecast

Motorcycle-focused route weather: forecasts, risks and warnings along a route, each point evaluated at the time you actually reach it.

Live: https://kaandinc.com/ridecast/

## Features

- **Routing:** Photon address search, OSRM (car, bike, foot) with alternatives, Valhalla when avoiding motorways, tolls or ferries. Via stops, drag-to-reroute, breaks and multi-day tours with overnight stops.
- **Timeline:** ETA per point from average or per-road-type speeds (road type guessed from refs and step speeds), shifted by breaks.
- **Weather:** Open-Meteo forecast sampled about every 15 min of riding (max 30 points), at 3-decimal coordinates so terrain height is respected. Ensemble spread (31 GFS runs) on demand, height profile, RainViewer radar.
- **Risk:** per-vehicle thresholds for rain, storm, snow, ice (air and ground temperature), fog, gusts, crosswind, riding wind chill, heat stress, wet road, darkness and low-sun glare (NOAA solar equations).
- **Decisions:** safest route (time-weighted risk score), best departure in the next 24 h or 7 days, clothing advice, break advice, forecast changes since the last look.
- **Live mode:** GPS tracking with pace-adjusted ETAs, alerts for new or worsening warnings, off-route re-planning, fuel range warning, wake lock, sunlight contrast mode.
- **App:** MapLibre map (Stadia vector tiles, OSM fallback), PWA with offline cache, share links that encode the full trip, English/Turkish, metric/imperial, light/dark.

## Setup

Node 22+.

```
npm install
npm run dev
npm run build    # tsc + Vite
npm run test     # Vitest
```

The build uses relative paths, so `dist/` works from any sub-path. `.github/workflows/pages.yml` deploys to GitHub Pages on every push to `main`.

## Layout

```
src/config/    thresholds, vehicle defaults and other tunable values
src/core/      pure TypeScript (no DOM or fetch): geometry, ETA, sampling, risk, advice
src/services/  Photon, OSRM, Valhalla, Open-Meteo clients and request cache
src/i18n/      English and Turkish texts, units
src/styles/    CSS, one file per part
src/ui/        map, panels, planner state
public/        manifest, icons, service worker
```

## Limits

- Uses free public services (OSRM demo, FOSSGIS, Photon, Open-Meteo, Stadia): light use only.
- Motorcycles use the car profile unless an avoid option is on. OSRM returns alternatives only for two-stop trips.
- ETA uses constant speeds per road type, with no traffic.
- Risks are checked per sample point, so a short shower between points can be missed. Thresholds are my own, except the wind chill formula.
- Live mode was tested with simulated GPS only. Browsers do not track reliably in the background.
- Share links do not carry the forecast; it is fetched again when the link is opened.

## License

All rights reserved. The source is public to read and learn from; copying, modifying or reusing it needs written permission. See [LICENSE](LICENSE).
