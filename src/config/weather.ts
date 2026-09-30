// Weather sampling along the route and Open-Meteo request limits.
export const WEATHER_SAMPLE = {
  intervalMin: 15, // one point per ~15 min of OSRM driving time
  maxPoints: 30, // Open-Meteo gets all points in one request
};

export const WEATHER_REQUEST = {
  // ~100 m. Open-Meteo moves temperatures to the 90 m terrain height of the exact point asked, so a
  // point on a pass gets the pass, not the valley town of a coarser grid point.
  coordDecimals: 3,
  pastHours: 6, // for the wet road estimate (stage 5)
  maxForecastDays: 16,
  minForecastDays: 3, // today + 2: covers every best-departure candidate, so both use one request
  maxHourGapMin: 90, // an ETA further than this from any forecast hour has no data
  farDays: 3, // forecasts further ahead than this are marked as uncertain
};

// Model range on the weather card: the same hour in every run of an ensemble model (GFS, 31 runs),
// from the low to the high percentile, so one wild run does not stretch it.
export const ENSEMBLE = { model: "gfs025", lowPct: 10, highPct: 90 };
