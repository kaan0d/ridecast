import { expect, test } from "vitest";
import { haversineM, lineLength, makeLine, pointAtDistance, snapToLine } from "./line";

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
