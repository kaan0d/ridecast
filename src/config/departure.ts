// Best departure time: candidates every stepH hours within the next windowH hours.
export const DEPARTURE = {
  windowH: 24,
  weekDays: 7, // "Next 7 days": the best departure of each day
  stepH: 1,
  count: 3,
  minGapH: 2, // the listed departures are at least this far apart, so they are real alternatives
  maxMissing: 0.25, // candidates with more of the route unforecast than this are skipped
};
