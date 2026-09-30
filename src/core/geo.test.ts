import { expect, test } from "vitest";
import { fromLngLat, fromLonLat, toLngLat, toLonLatString } from "./geo";

test("coordinate order conversions round-trip", () => {
  const p = fromLonLat([28.97, 41.01]);
  expect(p).toEqual({ lat: 41.01, lon: 28.97 });
  expect(toLonLatString(p)).toBe("28.97,41.01");
  expect(toLngLat(p)).toEqual([28.97, 41.01]);
  expect(fromLngLat({ lat: 41.01, lng: 28.97 })).toEqual(p);
});
