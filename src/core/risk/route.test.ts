import { describe, expect, test } from "vitest";
import { chooseSafest, pointRuns, routeScore, type RouteScore } from "./route";

const W = [0, 1, 3, 9];

describe("routeScore", () => {
  test("weights each point by the route share it stands for (same speed: distance share)", () => {
    // points at 0, 50, 100 km of 100 km: shares 25%, 50%, 25%
    const s = routeScore(
      [
        { distM: 0, level: 0, kmh: 80 },
        { distM: 50_000, level: 2, kmh: 80 },
        { distM: 100_000, level: 3, kmh: 80 },
      ],
      100_000,
      W,
    );
    expect(s.score).toBeCloseTo(0.5 * 3 + 0.25 * 9, 9);
    expect(s.worst).toBe(3);
    expect(s.missingShare).toBe(0);
  });

  test("a slow stretch counts for the time spent on it", () => {
    // Two halves of 50 km: fast and dry (100 km/h, 30 min), slow and rainy (25 km/h, 2 h).
    const s = routeScore(
      [
        { distM: 0, level: 0, kmh: 100 },
        { distM: 100_000, level: 2, kmh: 25 },
      ],
      100_000,
      W,
    );
    expect(s.score).toBeCloseTo(3 * (2 / 2.5), 9); // by distance it would be 1.5
  });

  test("points without a forecast are left out and reported", () => {
    const s = routeScore(
      [
        { distM: 0, level: 1, kmh: 80 },
        { distM: 100_000, level: null, kmh: 80 },
      ],
      100_000,
      W,
    );
    expect(s.score).toBe(1);
    expect(s.missingShare).toBeCloseTo(0.5, 9);
  });
});

describe("chooseSafest", () => {
  const sc = (score: number): RouteScore => ({ score, worst: 2, missingShare: 0 });

  test("recommends the lower risk route with the time cost and the drop", () => {
    const c = chooseSafest(
      [
        { durationS: 3 * 3600, score: sc(2) },
        { durationS: 3 * 3600 + 18 * 60, score: sc(1.2) },
      ],
      0.1,
    );
    expect(c).toEqual({ safest: 1, base: 0, extraMin: 18, riskDrop: expect.closeTo(0.4, 9) });
  });

  test("keeps the fastest when it is also the safest, or the gain is marginal", () => {
    expect(chooseSafest([{ durationS: 100, score: sc(1) }, { durationS: 200, score: sc(2) }], 0.1)).toEqual({ safest: 0, base: 0, extraMin: 0, riskDrop: 0 });
    expect(chooseSafest([{ durationS: 100, score: sc(1) }, { durationS: 200, score: sc(0.95) }], 0.1)?.safest).toBe(0);
  });

  test("ties go to the faster route; nothing to say without risk or alternatives", () => {
    expect(chooseSafest([{ durationS: 200, score: sc(1) }, { durationS: 100, score: sc(1) }], 0.1)?.safest).toBe(1);
    expect(chooseSafest([{ durationS: 100, score: sc(0) }, { durationS: 200, score: sc(0) }], 0.1)).toBeNull();
    expect(chooseSafest([{ durationS: 100, score: sc(2) }], 0.1)).toBeNull();
    expect(chooseSafest([{ durationS: 100, score: sc(2) }, { durationS: 90, score: null }], 0.1)).toBeNull();
  });
});

test("pointRuns: halfway boundaries, equal neighbours merged", () => {
  const pts = [
    { distM: 0, l: 0 },
    { distM: 20_000, l: 2 },
    { distM: 40_000, l: 2 },
    { distM: 100_000, l: 0 },
  ];
  expect(pointRuns(pts, 100_000, (p) => p.l)).toEqual([
    { from: 0, to: 10_000, v: 0 },
    { from: 10_000, to: 70_000, v: 2 },
    { from: 70_000, to: 100_000, v: 0 },
  ]);
  expect(pointRuns([], 100, () => 0)).toEqual([]);
});
