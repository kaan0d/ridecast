import { expect, test } from "vitest";
import { classifyPoi, fuelGaps, pickStops } from "./stops";

const at = { lat: 40, lon: 29 };

test("classifyPoi reads kind, name and shelter from OSM tags", () => {
  expect(classifyPoi("n1", at, { amenity: "fuel", brand: "Shell" })).toMatchObject({ kind: "fuel", name: "Shell", sheltered: true });
  expect(classifyPoi("n2", at, { amenity: "fuel" })).toMatchObject({ name: "", named: false });
  expect(classifyPoi("w3", at, { highway: "services", name: "Bolu Dağı Tesisleri" })).toMatchObject({ kind: "services", sheltered: true });
  expect(classifyPoi("n4", at, { highway: "rest_area" })).toMatchObject({ kind: "rest", sheltered: false });
  expect(classifyPoi("n5", at, { highway: "rest_area", shelter: "yes" })?.sheltered).toBe(true);
  expect(classifyPoi("n6", at, { amenity: "cafe" })).toBeNull();
});

test("pickStops orders and thins per kind; in bad weather only sheltered stops, marked", () => {
  const s = (id: string, kind: "fuel" | "rest", km: number, sheltered = true) => ({ id, kind, name: id, pos: at, sheltered, named: true, distM: km * 1000 });
  const picked = pickStops(
    [s("f3", "fuel", 12), s("f1", "fuel", 1), s("f2", "fuel", 3), s("r1", "rest", 4, false), s("f4", "fuel", 20), s("f5", "fuel", 22), s("r2", "rest", 21, false)],
    (d) => d >= 18_000, // rain from km 18
    5_000,
  );
  expect(picked.map((p) => [p.id, p.recommended])).toEqual([
    ["f1", false], // f2 is only 2 km later: thinned
    ["r1", false], // other kind, not thinned by the fuel stations
    ["f3", false],
    ["f4", true], // sheltered in the rain
  ]); // r2: no shelter in the rain; f5: 2 km after f4
});

test("fuel gaps: stretches between fill-ups longer than the range", () => {
  // 400 km trip, stations at 50, 120 and 330 km, 150 km range: 120 -> 330 is too long.
  expect(fuelGaps([120_000, 50_000, 330_000], 400_000, 150_000)).toEqual([{ fromM: 120_000, toM: 330_000 }]);
  // No stations: the whole trip if it is longer than the range, nothing if it is not.
  expect(fuelGaps([], 400_000, 150_000)).toEqual([{ fromM: 0, toM: 400_000 }]);
  expect(fuelGaps([], 100_000, 150_000)).toEqual([]);
  // The last stretch to the arrival counts too.
  expect(fuelGaps([100_000], 300_000, 150_000)).toEqual([{ fromM: 100_000, toM: 300_000 }]);
});
