import { describe, expect, test } from "vitest";
import { buildTimeline } from "../eta/eta";
import type { Assessment } from "../risk/risk";
import type { Step } from "../route/roadType";
import { liveTimeline, newOrWorse, nextWarning, odometerStep, offRouteCount, paceFactor, type Fix } from "./live";

const M = 60_000;
const T0 = Date.UTC(2026, 8, 24, 5);
const step = (km: number, leg = 0): Step => ({ distanceM: km * 1000, durationS: km * 36, ref: "", ferry: false, leg });
// 100 km at 100 km/h, break of 20 min at km 60
const tl = buildTimeline([step(50, 0), step(50, 1)], T0, { mode: "average", kmh: 100 }, [{ distM: 60_000, durationS: 1200 }]);
const rules = { windowMs: 15 * M, minElapsedMs: 3 * M, minDistM: 2000, min: 0.5, max: 1.6 };

describe("paceFactor", () => {
  test("1 on plan, above 1 when faster, below when slower", () => {
    const fix = (min: number, km: number): Fix => ({ t: T0 + min * M, distM: km * 1000, offM: 0 });
    expect(paceFactor([fix(0, 0), fix(6, 10)], tl, rules)).toBeCloseTo(1, 9); // 10 km in 6 min = 100 km/h
    expect(paceFactor([fix(0, 0), fix(5, 10)], tl, rules)).toBeCloseTo(1.2, 9); // 120 km/h
    expect(paceFactor([fix(0, 0), fix(12, 10)], tl, rules)).toBeCloseTo(0.5, 9); // 50 km/h
  });

  test("trusts the plan without enough movement, clamps, and forgets old fixes", () => {
    const fix = (min: number, km: number): Fix => ({ t: T0 + min * M, distM: km * 1000, offM: 0 });
    expect(paceFactor([], tl, rules)).toBe(1);
    expect(paceFactor([fix(0, 0), fix(2, 3)], tl, rules)).toBe(1); // under 3 min
    expect(paceFactor([fix(0, 0), fix(10, 1)], tl, rules)).toBe(1); // under 2 km
    expect(paceFactor([fix(0, 0), fix(3, 20)], tl, rules)).toBe(1.6); // 400 km/h: clamped
    // a stop long ago does not count: only the last 15 min are used
    expect(paceFactor([fix(0, 0), fix(40, 5), fix(46, 15)], tl, rules)).toBeCloseTo(1, 9);
  });
});

test("liveTimeline re-anchors the rest of the trip at now, scaled by pace", () => {
  // 100 km/h: km 30 is planned 18 min after departure; the rider is there at 28 min, 10 min late
  const now = T0 + 28 * M;
  const live = liveTimeline(tl, 30_000, now, 1);
  expect(live.timeMs.at(-1)).toBe(tl.timeMs.at(-1)! + 10 * M);
  expect(live.breaks[0].startMs).toBe(now + 18 * M); // km 60 is 18 planned min ahead
  const fast = liveTimeline(tl, 30_000, now, 2);
  expect(fast.legArrivalMs[0]).toBe(now + 6 * M); // km 50: 12 planned min at double pace
});

const risk = (events: Assessment["events"]): Assessment => ({ level: events[0]?.level ?? 0, events, feltC: 10, road: "dry", dark: false });
const points = [
  { distM: 0, risk: risk([{ kind: "road", level: 1, text: "Nemli yol" }]) },
  { distM: 20_000, risk: risk([]) },
  { distM: 40_000, risk: risk([{ kind: "rain", level: 2, text: "Yağmur" }]) },
  { distM: 60_000, risk: null },
  { distM: 80_000, risk: risk([{ kind: "gust", level: 3, text: "Hamle" }]) },
];

test("nextWarning finds the closest warning ahead at the given level", () => {
  expect(nextWarning(points, 5_000, 2)).toMatchObject({ index: 2, aheadM: 35_000, event: { text: "Yağmur" } });
  expect(nextWarning(points, 45_000, 2)).toMatchObject({ index: 4, aheadM: 35_000 });
  expect(nextWarning(points, 0, 1)?.index).toBe(0);
  expect(nextWarning(points, 85_000, 1)).toBeNull();
});

test("newOrWorse reports only new or worsened warnings ahead", () => {
  const first = newOrWorse(new Map(), points, 0, 2);
  expect(first.changes.map((c) => c.text)).toEqual(["Yağmur", "Hamle"]);
  const same = newOrWorse(first.next, points, 0, 2);
  expect(same.changes).toEqual([]);
  const worse = points.map((p, i) => (i === 2 ? { ...p, risk: risk([{ kind: "rain", level: 3, text: "Şiddetli yağmur" }]) } : p));
  expect(newOrWorse(same.next, worse, 0, 2).changes).toEqual([{ index: 2, text: "Şiddetli yağmur", level: 3 }]);
  expect(newOrWorse(new Map(), points, 50_000, 2).changes.map((c) => c.text)).toEqual(["Hamle"]); // behind the rider: ignored
});

test("offRouteCount counts consecutive fixes away from the route, allowing for accuracy", () => {
  expect(offRouteCount(0, 200, 10, 150)).toBe(1);
  expect(offRouteCount(1, 220, 10, 150)).toBe(2);
  expect(offRouteCount(2, 200, 200, 150)).toBe(0); // 200 m off with 200 m accuracy: not sure
  expect(offRouteCount(2, 50, 10, 150)).toBe(0);
});

test("odometerStep counts real moves and ignores jitter within the accuracy", () => {
  const a = { lat: 0, lon: 0 };
  expect(odometerStep(null, a, 10, 20)).toEqual({ addM: 0, anchor: a });
  const near = { lat: 0, lon: 0.0001 }; // ~11 m
  expect(odometerStep(a, near, 10, 20)).toEqual({ addM: 0, anchor: a });
  const far = { lat: 0, lon: 0.001 }; // ~111 m
  expect(odometerStep(a, far, 10, 20).addM).toBeCloseTo(111.2, 0);
  expect(odometerStep(a, far, 150, 20).addM).toBe(0); // worse accuracy than the move
});
