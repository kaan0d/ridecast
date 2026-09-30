// Height profile of the route (Open-Meteo Elevation API).
export const ELEVATION = {
  points: 100, // the API's limit per request: one request per route
  noiseM: 10, // rises and dips smaller than this are terrain model noise, not climbing
};
