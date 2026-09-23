import { expect, test } from "vitest";
import { bearingAt, haversineM, lineLength, makeLine, pointAtDistance, segmentBoxes, sliceLine, snapToLine } from "./line";

// Along the equator 0.01° of longitude is about 1113 m.
const line = makeLine([
  { lat: 0, lon: 0 },
  { lat: 0, lon: 0.01 },
  { lat: 0.01, lon: 0.01 },
]);

test("haversine and cumulative length", () => {
  expect(haversineM({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111195, -1);
  expect(lineLength(line)).toBeCloseTo(2 * 1111.95, 0);
});

test("snap projects onto the nearest segment and gives distance along the line", () => {
  const s = snapToLine(line, { lat: 0.002, lon: 0.005 });
  expect(s.pos.lat).toBeCloseTo(0, 9);
  expect(s.pos.lon).toBeCloseTo(0.005, 9);
  expect(s.distM).toBeCloseTo(556, 0);

  const s2 = snapToLine(line, { lat: 0.005, lon: 0.02 });
  expect(s2.pos).toEqual({ lat: 0.005, lon: 0.01 });
  expect(s2.distM).toBeCloseTo(1112 + 556, 0);

  // Beyond the start clamps to the first vertex.
  expect(snapToLine(line, { lat: 0, lon: -1 }).distM).toBe(0);
});

test("pointAtDistance is the inverse of snap and clamps", () => {
  const p = pointAtDistance(line, 1112 + 556);
  expect(p.lon).toBeCloseTo(0.01, 9);
  expect(p.lat).toBeCloseTo(0.005, 4);
  expect(pointAtDistance(line, -1)).toEqual({ lat: 0, lon: 0 });
  expect(pointAtDistance(line, 1e9)).toEqual({ lat: 0.01, lon: 0.01 });
});

test("sliceLine cuts at both distances and keeps the vertices between", () => {
  const s = sliceLine(line, 556, 1112 + 556);
  expect(s[0].lon).toBeCloseTo(0.005, 6);
  expect(s[1]).toEqual({ lat: 0, lon: 0.01 });
  expect(s[2].lat).toBeCloseTo(0.005, 4);
  expect(s).toHaveLength(3);
});

test("bearingAt gives the direction of travel", () => {
  expect(bearingAt(line, 500)).toBeCloseTo(90, 3); // east along the equator
  expect(bearingAt(line, 1600)).toBeCloseTo(0, 3); // then north
});

test("segmentBoxes covers the line in padded pieces that share their joints", () => {
  expect(segmentBoxes(line, 5000, 0.001)).toEqual([{ south: -0.001, west: -0.001, north: 0.011, east: 0.011 }]);
  const two = segmentBoxes(line, 1000, 0); // each ~1112 m edge becomes its own box
  expect(two).toEqual([
    { south: 0, west: 0, north: 0, east: 0.01 },
    { south: 0, west: 0.01, north: 0.01, east: 0.01 },
  ]);
});
