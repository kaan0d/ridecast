import { expect, test } from "vitest";
import { fromLatLng, fromLonLat, toLatLng, toLonLatString } from "./geo";

test("coordinate order conversions round-trip", () => {
  const p = fromLonLat([28.97, 41.01]);
  expect(p).toEqual({ lat: 41.01, lon: 28.97 });
  expect(toLonLatString(p)).toBe("28.97,41.01");
  expect(toLatLng(p)).toEqual([41.01, 28.97]);
  expect(fromLatLng({ lat: 41.01, lng: 28.97 })).toEqual(p);
});
