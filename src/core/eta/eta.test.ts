import { describe, expect, test } from "vitest";
import { guessRoadType, roadBreakdown, type RoadTypeRules, type Step } from "../route/roadType";
import { autoBreakDistances, buildTimeline, distanceAtTime, etaAtDistance, resumeAtClock, speedAtDistance, tripDays, type SpeedSetting } from "./eta";

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

describe("breaks", () => {
  const avg50: SpeedSetting = { mode: "average", kmh: 50 };
  const M = 60_000;

  test("a break shifts every later time by its duration, not earlier ones", () => {
    const steps = [step(50, 50, { leg: 0 }), step(50, 50, { leg: 1 })];
    const plain = buildTimeline(steps, T0, avg50);
    const t = buildTimeline(steps, T0, avg50, [{ distM: 25_000, durationS: 15 * 60 }]);
    expect(etaAtDistance(t, 20_000)).toBe(etaAtDistance(plain, 20_000));
    expect(etaAtDistance(t, 25_000)).toBe(T0 + 30 * M); // arrival at the break
    expect(etaAtDistance(t, 75_000)).toBe(etaAtDistance(plain, 75_000) + 15 * M);
    expect(t.legArrivalMs).toEqual([T0 + H + 15 * M, T0 + 2 * H + 15 * M]);
    expect(t.breaks).toEqual([{ distM: 25_000, startMs: T0 + 30 * M, endMs: T0 + 45 * M }]);
  });

  test("breaks are sorted, stack up, and a break at a stop starts after the arrival", () => {
    const steps = [step(50, 50, { leg: 0 }), step(50, 50, { leg: 1 })];
    const t = buildTimeline(steps, T0, avg50, [
      { distM: 75_000, durationS: 30 * 60 },
      { distM: 50_000, durationS: 10 * 60 },
    ]);
    expect(t.legArrivalMs[0]).toBe(T0 + H); // stop reached before its break
    // 60 min riding + 10 min break + 30 min riding
    expect(t.breaks.map((b) => b.startMs)).toEqual([T0 + H, T0 + 100 * M]);
    expect(t.timeMs.at(-1)).toBe(T0 + 2 * H + 40 * M);
  });

  test("breaks past the end are dropped", () => {
    const t = buildTimeline([step(50, 50)], T0, avg50, [{ distM: 60_000, durationS: 600 }]);
    expect(t.breaks).toEqual([]);
    expect(t.timeMs.at(-1)).toBe(T0 + H);
  });

  test("auto breaks every N km or N minutes of riding", () => {
    const ride = buildTimeline([step(100, 50), step(150, 50)], T0, avg50); // 250 km, 5 h
    expect(autoBreakDistances(ride, { every: 100, unit: "km" })).toEqual([100_000, 200_000]);
    expect(autoBreakDistances(ride, { every: 90, unit: "min" })).toEqual([75_000, 150_000, 225_000]);
    expect(autoBreakDistances(ride, { every: 0, unit: "km" })).toEqual([]);
    expect(distanceAtTime(ride, T0 + 2.5 * H)).toBe(125_000);
  });
});

test("speedAtDistance is the moving speed, also next to a break", () => {
  const t = buildTimeline([step(50, 50), step(50, 50)], T0, { mode: "road", kmh: { motorway: 120, primary: 80, urban: 40 }, rules }, [
    { distM: 50_000, durationS: 900 },
  ]);
  expect(speedAtDistance(t, 10_000)).toBeCloseTo(40, 6); // OSRM 50 km/h counts as urban
  expect(speedAtDistance(t, 50_000)).toBeCloseTo(40, 6); // at the break itself
  expect(speedAtDistance(t, 100_000)).toBeCloseTo(40, 6);
});

describe("overnight stops", () => {
  const TR = 180; // UTC+3
  const local = (d: number, h: number, m = 0) => Date.UTC(2026, 8, d, h - 3, m); // Turkish clock to UTC
  const MIN_STAY = 4 * H;

  test("resume at the next 08:00 local that leaves at least the minimum stay", () => {
    expect(resumeAtClock(local(24, 19, 30), 8 * 60, MIN_STAY, TR)).toBe(local(25, 8));
    expect(resumeAtClock(local(25, 1, 0), 8 * 60, MIN_STAY, TR)).toBe(local(25, 8)); // arrive after midnight: same morning
    expect(resumeAtClock(local(25, 6, 0), 8 * 60, MIN_STAY, TR)).toBe(local(26, 8)); // only 2 h: next day
  });

  test("the timeline waits until the resume time and the trip splits into days", () => {
    const steps = [step(100, 50), step(100, 50)];
    const avg50: SpeedSetting = { mode: "average", kmh: 50 };
    const depart = local(24, 16);
    const t = buildTimeline(steps, depart, avg50, [
      { distM: 100_000, durationS: 0, resumeAt: (ms) => resumeAtClock(ms, 8 * 60, MIN_STAY, TR) },
      { distM: 150_000, durationS: 30 * 60 },
    ]);
    // 100 km at 50 km/h: arrive 18:00, sleep, go on 08:00; 50 km to 09:00, 30 min break, 50 km to 10:30.
    expect(t.breaks[0]).toEqual({ distM: 100_000, startMs: local(24, 18), endMs: local(25, 8) });
    expect(t.timeMs.at(-1)).toBe(local(25, 10, 30));
    expect(tripDays(t, [true, false])).toEqual([
      { startMs: depart, endMs: local(24, 18), fromM: 0, toM: 100_000 },
      { startMs: local(25, 8), endMs: local(25, 10, 30), fromM: 100_000, toM: 200_000 },
    ]);
    expect(tripDays(t, [false, false])).toHaveLength(1);
  });
});
