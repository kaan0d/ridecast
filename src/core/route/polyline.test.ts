import { expect, test } from "vitest";
import { decodePolyline } from "./polyline";

test("decodes the reference polyline from Google's format description", () => {
  const pts = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5);
  expect(pts).toEqual([
    { lat: 38.5, lon: -120.2 },
    { lat: 40.7, lon: -120.95 },
    { lat: 43.252, lon: -126.453 },
  ]);
});

test("precision 6 (Valhalla) scales by 1e6", () => {
  // The same deltas read at precision 6 are ten times smaller.
  expect(decodePolyline("_p~iF~ps|U", 6)).toEqual([{ lat: 3.85, lon: -12.02 }]);
});
