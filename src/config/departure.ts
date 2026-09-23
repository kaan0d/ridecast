// Best departure time: candidates every stepH hours within the next windowH hours.
export const DEPARTURE = {
  windowH: 24,
  stepH: 1,
  count: 3,
  maxMissing: 0.25, // candidates with more of the route unforecast than this are skipped
};
