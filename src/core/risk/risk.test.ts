import { describe, expect, test } from "vitest";
import type { WeatherHour } from "../weather/weather";
import { assessPoint, breakAdvice, isDark, relativeWindKmh, roadState, windChillC, type RiskThresholds } from "./risk";

const H = 3_600_000;
const T0 = Date.UTC(2026, 10, 10, 6);
const hour = (i: number, over: Partial<WeatherHour> = {}): WeatherHour => ({
  timeMs: T0 + i * H,
  tempC: 15,
  feelsC: 15,
  precipMm: 0,
  precipProb: 0,
  snowCm: 0,
  code: 0,
  windKmh: 0,
  gustKmh: 10,
  windFromDeg: 0,
  visibilityM: 20_000,
  isDay: true,
  ...over,
});

const moto: RiskThresholds = {
  rainMm: [0.1, 1, 4],
  gustKmh: [35, 50, 65],
  visibilityM: [5000, 2000, 800],
  coldC: [10, 5, 0],
  windChill: true,
  iceTempC: 1,
  nearFreezingC: 3,
  snow: 3,
  storm: 3,
  dark: 2,
  road: { damp: 1, wet: 2 },
};
const car: RiskThresholds = { ...moto, rainMm: [1, 4, 10], gustKmh: [50, 70, 90], coldC: null, windChill: false, dark: 1, road: { damp: 0, wet: 1 } };
const wet = { recentHours: 3, wetNowMm: 0.5, wetRecentMm: 1.5, dampRecentMm: 0.2 };
const day = [{ riseMs: T0, setMs: T0 + 11 * H }];
const at = (hours: WeatherHour[], i: number, t = moto, rideKmh = 90, headingDeg = 0) =>
  assessPoint({ hours, i, etaMs: hours[i].timeMs, rideKmh, headingDeg, sun: day }, t, wet);

describe("wind chill", () => {
  test("matches the published table", () => {
    // Environment Canada table: -5 °C at 30 km/h feels like -13
    expect(Math.round(windChillC(-5, 30))).toBe(-13);
    expect(Math.round(windChillC(-10, 20))).toBe(-18);
    expect(windChillC(12, 100)).toBe(12); // outside the formula's range
    expect(windChillC(0, 3)).toBe(0);
  });

  test("relative wind adds a headwind and subtracts a tailwind", () => {
    expect(relativeWindKmh(90, 20, 0, 0)).toBeCloseTo(110); // from ahead, heading north
    expect(relativeWindKmh(90, 20, 180, 0)).toBeCloseTo(70);
    expect(relativeWindKmh(90, 20, 90, 0)).toBeCloseTo(90); // side wind
    expect(relativeWindKmh(5, 20, 180, 0)).toBe(0);
  });
});

describe("road state", () => {
  test("dry, damp from earlier rain, wet, ice when cold", () => {
    expect(roadState([hour(0), hour(1), hour(2)], 2, wet, 1)).toBe("dry");
    expect(roadState([hour(0, { precipMm: 0.3 }), hour(1), hour(2)], 2, wet, 1)).toBe("damp");
    expect(roadState([hour(0, { precipMm: 1 }), hour(1, { precipMm: 0.6 }), hour(2)], 2, wet, 1)).toBe("wet");
    expect(roadState([hour(0, { precipMm: 2 }), hour(1), hour(2)], 2, wet, 1)).toBe("wet");
    // rain four hours ago is outside the 3 hour window
    expect(roadState([hour(0, { precipMm: 5 }), hour(1), hour(2), hour(3)], 3, wet, 1)).toBe("dry");
    expect(roadState([hour(0), hour(1, { precipMm: 0.3, tempC: 0 })], 1, wet, 1)).toBe("ice");
  });
});

describe("assessPoint", () => {
  test("calm dry day has no warnings", () => {
    const a = at([hour(0), hour(1)], 1, moto, 90);
    expect(a.level).toBe(0);
    expect(a.events).toEqual([]);
    expect(a.road).toBe("dry");
  });

  test("motorcycle warns earlier than a car for the same weather", () => {
    const hours = [hour(0), hour(1, { precipMm: 0.6, gustKmh: 45 })];
    const m = at(hours, 1, moto);
    const c = at(hours, 1, car);
    expect(m.events.map((e) => [e.kind, e.level])).toEqual([
      ["road", 2],
      ["rain", 1],
      ["gust", 1],
    ]);
    expect(c.events.map((e) => [e.kind, e.level])).toEqual([["road", 1]]);
  });

  test("cold uses the wind chill at riding speed, not the air temperature", () => {
    const hours = [hour(0, { tempC: 8, feelsC: 7 })];
    const a = at(hours, 0, moto, 100);
    expect(a.feltC).toBeLessThan(3);
    expect(a.events.find((e) => e.kind === "cold")?.level).toBe(2);
    expect(at(hours, 0, car).events.find((e) => e.kind === "cold")).toBeUndefined();
  });

  test("storm, snow, fog, ice and darkness", () => {
    expect(at([hour(0, { code: 95, precipMm: 3 })], 0).events[0]).toMatchObject({ kind: "storm", level: 3 });
    expect(at([hour(0, { code: 73, snowCm: 0.5, tempC: -1 })], 0).events.map((e) => e.kind)).toContain("snow");
    expect(at([hour(0, { code: 45, visibilityM: 1500 })], 0).events[0]).toMatchObject({ kind: "visibility", level: 2 });
    expect(at([hour(0, { code: 45, visibilityM: 8200 })], 0).events[0]).toMatchObject({ kind: "visibility", level: 1 });
    expect(at([hour(0, { tempC: 0.5, precipMm: 0.2 })], 0).events[0]).toMatchObject({ kind: "ice", level: 3 });
    expect(at([hour(0, { tempC: 2.5 })], 0).events.find((e) => e.kind === "ice")?.level).toBe(2);
    const night = assessPoint({ hours: [hour(0)], i: 0, etaMs: T0 + 12 * H, rideKmh: 90, headingDeg: 0, sun: day }, moto, wet);
    expect(night.dark).toBe(true);
    expect(night.events).toEqual([{ kind: "dark", level: 2, text: "Karanlıkta sürüş" }]);
  });
});

test("isDark needs sun times and checks every day", () => {
  expect(isDark([], T0)).toBe(false);
  expect(isDark(day, T0 + H)).toBe(false);
  expect(isDark(day, T0 - H)).toBe(true);
  expect(isDark([...day, { riseMs: T0 + 24 * H, setMs: T0 + 35 * H }], T0 + 25 * H)).toBe(false);
});

describe("breakAdvice", () => {
  const hours = [0, 1, 2, 3, 4].map((i) => hour(i));
  const rainy = (from: number, to: number) => hours.map((h, i) => (i >= from && i <= to ? { ...h, precipMm: 1 } : h));

  test("rain starting during the break says when", () => {
    // break 00:00-01:30 (UTC offsets from T0); the 01:00 hour is wet, so rain from 00:30
    expect(breakAdvice(rainy(1, 4), T0, T0 + 1.5 * H, 0.1, 90)).toEqual({ kind: "rainStarts", atMin: 30 });
  });

  test("rain stopping soon after the break suggests staying longer", () => {
    // wet until the 02:00 hour, dry from 03:00, so dry from 02:30; break ends 01:40
    expect(breakAdvice(rainy(0, 2), T0 + 1 * H, T0 + 1 * H + 40 * 60_000, 0.1, 90)).toEqual({ kind: "rainStops", extendMin: 50 });
  });

  test("no advice when dry, or when rain lasts past the limit", () => {
    expect(breakAdvice(hours, T0, T0 + H, 0.1, 90)).toBeNull();
    expect(breakAdvice(rainy(0, 4), T0, T0 + H, 0.1, 90)).toBeNull();
  });
});
