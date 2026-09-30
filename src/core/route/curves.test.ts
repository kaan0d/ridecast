import { expect, test } from "vitest";
import { curvyDistance } from "./curves";
import { makeLine } from "./line";

const RULES = { pieceM: 100, turnDeg: 15, minRunPieces: 10, maxGapPieces: 1 };
const M_PER_DEG = 111_195; // along the equator

// Points every 10 m along a path given by a heading (degrees) per metre travelled.
function path(lengthM: number, headingAt: (m: number) => number) {
  const pts = [{ lat: 0, lon: 0 }];
  for (let m = 10; m <= lengthM; m += 10) {
    const h = (headingAt(m) * Math.PI) / 180;
    const p = pts[pts.length - 1];
    pts.push({ lat: p.lat + (10 * Math.cos(h)) / M_PER_DEG, lon: p.lon + (10 * Math.sin(h)) / M_PER_DEG });
  }
  return makeLine(pts);
}

test("a straight road has no bends", () => {
  expect(curvyDistance(path(5000, () => 90), RULES)).toBe(0);
});

test("a road swinging 60° either way every 300 m is bends all along", () => {
  const d = curvyDistance(path(5000, (m) => 90 + 60 * Math.sin((m / 600) * 2 * Math.PI)), RULES);
  expect(d).toBeGreaterThan(3000);
});

test("town corners every 400 m do not count", () => {
  // a grid: 90° left, then 90° right, 400 m apart
  expect(curvyDistance(path(5000, (m) => (Math.floor(m / 400) % 2 ? 0 : 90)), RULES)).toBe(0);
});

test("a winding stretch in the middle counts on its own", () => {
  const d = curvyDistance(path(10_000, (m) => (m > 4000 && m < 6000 ? 90 + 60 * Math.sin((m / 600) * 2 * Math.PI) : 90)), RULES);
  expect(d).toBeGreaterThan(1200);
  expect(d).toBeLessThanOrEqual(2200);
});
