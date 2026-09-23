// Weather sampling along the route and Open-Meteo request limits.
export const WEATHER_SAMPLE = {
  intervalMin: 15, // one point per ~15 min of OSRM driving time
  maxPoints: 30, // Open-Meteo gets all points in one request
};

export const WEATHER_REQUEST = {
  coordRoundDeg: 0.05, // ~5 km; nearby points share cache entries
  pastHours: 6, // for the wet road estimate (stage 5)
  maxForecastDays: 16,
  maxHourGapMin: 90, // an ETA further than this from any forecast hour has no data
};
