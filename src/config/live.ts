// Live mode (GPS).
export const LIVE = {
  weatherRefreshMs: 12 * 60_000, // fresh forecast every 12 min while riding
  offRouteM: 150, // a fix further than this from the route (and than its accuracy allows) is off
  offRouteFixes: 3, // consecutive off fixes before suggesting a new route
  poorAccuracyM: 100,
  replanEveryMs: 60_000, // re-plan ETAs at least this often
  replanPaceDelta: 0.05, // or when the pace changes more than this
  nextMinLevel: 1 as const, // "next warning" shows low warnings too
  alertMinLevel: 2 as const, // alerts only for medium and high
  pace: { windowMs: 15 * 60_000, minElapsedMs: 3 * 60_000, minDistM: 2000, min: 0.5, max: 1.6 },
};
