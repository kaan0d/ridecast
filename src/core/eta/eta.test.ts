import { describe, expect, test } from "vitest";
import { guessRoadType, roadBreakdown, type RoadTypeRules, type Step } from "../route/roadType";
import { buildTimeline, etaAtDistance, type SpeedSetting } from "./eta";

const rules: RoadTypeRules = { motorwayMinKmh: 90, primaryMinKmh: 70, motorwayRef: /^O-?\d/, primaryRef: /^D-?\d/ };
const H = 3600_000;
const T0 = Date.UTC(2026, 8, 23, 6, 0);

// OSRM duration chosen so the step's own average speed is `osrmKmh`.
const step = (km: number, osrmKmh: number, extra: Partial<Step> = {}): Step => ({
  distanceM: km * 1000,
  durationS: (km / osrmKmh) * 3600,
  ref: "",
  ferry: false,
  leg: 0,
  ...extra,
});

describe("guessRoadType", () => {
  test("uses ref first, then OSRM average speed", () => {
    expect(guessRoadType(step(10, 50, { ref: "O-4" }), rules)).toBe("motorway");
    expect(guessRoadType(step(10, 50, { ref: "D-160" }), rules)).toBe("primary");
    expect(guessRoadType(step(10, 95), rules)).toBe("motorway");
    expect(guessRoadType(step(10, 75), rules)).toBe("primary");
    expect(guessRoadType(step(10, 40), rules)).toBe("urban");
    expect(guessRoadType({ ...step(0, 1), durationS: 0 }, rules)).toBe("urban");
  });

  test("breakdown sums distance per type", () => {
    const b = roadBreakdown([step(100, 100), step(20, 75), step(5, 30), step(8, 20, { ferry: true })], rules);
    expect(b).toEqual({ motorway: 100_000, primary: 20_000, urban: 5_000, ferry: 8_000 });
  });
});

describe("buildTimeline", () => {
  test("average speed: 100 km at 100 km/h takes one hour", () => {
    const t = buildTimeline([step(50, 30), step(50, 120)], T0, { mode: "average", kmh: 100 });
    expect(t.timeMs.at(-1)).toBe(T0 + H);
    expect(t.distM).toEqual([0, 50_000, 100_000]);
  });

  test("road mode uses the speed of each guessed road type", () => {
    const speed: SpeedSetting = { mode: "road", kmh: { motorway: 120, primary: 80, urban: 40 }, rules };
    // 120 km motorway = 1 h, 40 km primary = 0.5 h, 20 km urban = 0.5 h
    const t = buildTimeline([step(120, 100), step(40, 75, { ref: "D-100" }), step(20, 35)], T0, speed);
    expect(t.timeMs.at(-1)).toBe(T0 + 2 * H);
  });

  test("ferry keeps OSRM duration, leg arrivals mark each stop", () => {
    const steps = [step(50, 100, { leg: 0 }), step(10, 20, { ferry: true, leg: 1 }), step(50, 100, { leg: 1 })];
    const t = buildTimeline(steps, T0, { mode: "average", kmh: 50 });
    expect(t.legArrivalMs).toEqual([T0 + H, T0 + 2.5 * H]);
  });

  test("etaAtDistance interpolates and clamps", () => {
    const t = buildTimeline([step(50, 50), step(50, 50)], T0, { mode: "average", kmh: 50 });
    expect(etaAtDistance(t, 25_000)).toBe(T0 + 0.5 * H);
    expect(etaAtDistance(t, 75_000)).toBe(T0 + 1.5 * H);
    expect(etaAtDistance(t, -5)).toBe(T0);
    expect(etaAtDistance(t, 1e9)).toBe(T0 + 2 * H);
  });
});
