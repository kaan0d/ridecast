// Weather sampling along the route and Open-Meteo request limits.
export const WEATHER_SAMPLE = {
  intervalMin: 15, // one point per ~15 min of OSRM driving time
  maxPoints: 30, // Open-Meteo gets all points in one request
};

export const WEATHER_REQUEST = {
  coordRoundDeg: 0.05, // ~5 km; nearby points share cache entries
  pastHours: 6, // for the wet road estimate (stage 5)
  maxForecastDays: 16,
  minForecastDays: 3, // today + 2: covers every best-departure candidate, so both use one request
  maxHourGapMin: 90, // an ETA further than this from any forecast hour has no data
  farDays: 3, // forecasts further ahead than this are marked as uncertain
};

// Temperatures are forecast for the height of the rounded grid point; the road can be hundreds of
// metres higher or lower (a pass above a valley town). Standard atmosphere lapse rate.
export const LAPSE_C_PER_KM = 6.5;
