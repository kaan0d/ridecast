import { describe, expect, test } from "vitest";
import { atHeight, bracketHours, spread, compassIndex, conditionOf, sampleDistances, type WeatherHour } from "./weather";

describe("sampleDistances", () => {
  test("one point per interval of driving time, start and end included", () => {
    // 3 h 25 min at 15 min per point: 14 gaps
    const d = sampleDistances(273_000, 205 * 60, 15, 30);
    expect(d).toHaveLength(15);
    expect(d[0]).toBe(0);
    expect(d.at(-1)).toBe(273_000);
    expect(d[1]).toBeCloseTo(273_000 / 14, 6);
  });

  test("capped at maxPoints, at least start and end", () => {
    expect(sampleDistances(1_000_000, 12 * 3600, 15, 30)).toHaveLength(30);
    expect(sampleDistances(2_000, 120, 15, 30)).toEqual([0, 2_000]);
    expect(sampleDistances(0, 0, 15, 30)).toEqual([0]);
  });
});

describe("bracketHours", () => {
  const T0 = Date.UTC(2026, 8, 25, 5);
  const hour = (h: number): WeatherHour => ({
    timeMs: T0 + h * 3_600_000,
    tempC: h,
    feelsC: h,
    precipMm: 0,
    precipProb: 0,
    snowCm: 0,
    code: 0,
    windKmh: 0,
    gustKmh: 0,
    windFromDeg: 0,
    visibilityM: 10_000,
    isDay: true,
  });
  const series = [0, 1, 2, 3].map(hour);

  test("the hours on both sides, nearest first", () => {
    expect(bracketHours(series, T0 + 1.4 * 3_600_000, 90)).toEqual([1, 2]);
    expect(bracketHours(series, T0 + 1.6 * 3_600_000, 90)).toEqual([2, 1]);
  });

  test("one hour when the time is on the hour or past either end", () => {
    expect(bracketHours(series, T0 + 2 * 3_600_000, 90)).toEqual([2]);
    expect(bracketHours(series, T0 - 30 * 60_000, 90)).toEqual([0]);
    expect(bracketHours(series, T0 + 3 * 3_600_000 + 80 * 60_000, 90)).toEqual([3]);
  });

  test("none outside the forecast range", () => {
    expect(bracketHours(series, T0 + 5 * 3_600_000, 90)).toEqual([]);
    expect(bracketHours([], T0, 90)).toEqual([]);
  });
});

test("WMO codes map to kinds and Turkish labels", () => {
  expect(conditionOf(0)).toEqual({ kind: "clear", name: "clear" });
  expect(conditionOf(45).kind).toBe("fog");
  expect(conditionOf(61)).toEqual({ kind: "rain", name: "lightRain" });
  expect(conditionOf(82).name).toBe("heavyRain");
  expect(conditionOf(75).kind).toBe("snow");
  expect(conditionOf(96).kind).toBe("storm");
  expect(conditionOf(53).kind).toBe("drizzle");
});

test("compass sectors", () => {
  expect(compassIndex(0)).toBe(0);
  expect(compassIndex(44)).toBe(1);
  expect(compassIndex(180)).toBe(4);
  expect(compassIndex(-90)).toBe(6);
  expect(compassIndex(350)).toBe(0);
});

describe("atHeight", () => {
  const h: WeatherHour = { timeMs: 0, tempC: 10, feelsC: 8, precipMm: 0, precipProb: 0, snowCm: 0, code: 0, windKmh: 0, gustKmh: 0, windFromDeg: 0, visibilityM: 10_000, isDay: true, groundC: 6 };

  test("a road 1000 m above the grid point is 6.5° colder, ground included", () => {
    const f = atHeight({ hours: [h], heightM: 500 }, 1500, 6.5);
    expect(f.hours[0].tempC).toBeCloseTo(3.5, 6);
    expect(f.hours[0].feelsC).toBeCloseTo(1.5, 6);
    expect(f.hours[0].groundC).toBeCloseTo(-0.5, 6);
    expect(f.heightM).toBe(1500);
  });

  test("lower is warmer; no height or a missing ground value is left alone", () => {
    expect(atHeight({ hours: [h], heightM: 800 }, 600, 6.5).hours[0].tempC).toBeCloseTo(11.3, 6);
    expect(atHeight({ hours: [{ ...h, groundC: null }], heightM: 800 }, 600, 6.5).hours[0].groundC).toBeNull();
    const bare = { hours: [h] };
    expect(atHeight(bare, 600, 6.5)).toBe(bare);
  });
});

describe("spread", () => {
  test("10th and 90th percentile by nearest rank; missing values left out", () => {
    const v = [5, 1, 9, 3, 7, 2, 8, 4, 6, 10]; // 1..10
    expect(spread(v, 10, 90)).toEqual({ lo: 1, hi: 9 });
    expect(spread([...v, NaN], 10, 90)).toEqual({ lo: 1, hi: 9 });
    // 31 runs: the 4th lowest and the 28th
    const runs = Array.from({ length: 31 }, (_, i) => i);
    expect(spread(runs, 10, 90)).toEqual({ lo: 3, hi: 27 });
    expect(spread([4], 10, 90)).toEqual({ lo: 4, hi: 4 });
  });
});
