// Fuel and rest stops from Overpass, along the selected route.
export const STOPS = {
  corridorM: 1000, // keep stops at most this far from the route
  boxSegmentM: 20_000, // the query is one bounding box per ~20 km of route (much faster than "around" a long line)
  boxPadDeg: 0.01, // ~1 km padding, so the boxes cover the corridor
  minGapM: 10_000, // of each kind, show at most one stop per this stretch
  badFeltC: 5, // felt temperature at or below this counts as cold for shelter
};
