export const SHARE = {
  storageKey: "ridecast.recent",
  maxRecent: 6,
  clipboardTimeoutMs: 1500,
  maxLabel: 60, // stop labels in links are cut to their first two parts and this many characters
};

// "Son bakıştan beri": warnings saved per trip and compared when the trip is opened again.
export const CHANGES = {
  storageKey: "ridecast.snapshots",
  maxTrips: 10,
  minAgeMs: 10 * 60_000, // a snapshot younger than this is the same look, not a comparison
  nearM: 30_000, // same kind of warning within this distance counts as the same warning
  minShiftMs: 30 * 60_000, // moves smaller than these are not reported
  minShiftM: 10_000,
};
