import { describe, expect, test } from "vitest";
import { compass, conditionOf, nearestHour, sampleDistances, type WeatherHour } from "./weather";

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

describe("nearestHour", () => {
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

  test("picks the closest hour", () => {
    expect(nearestHour(series, T0 + 1.4 * 3_600_000, 90)?.tempC).toBe(1);
    expect(nearestHour(series, T0 + 1.6 * 3_600_000, 90)?.tempC).toBe(2);
  });

  test("returns null outside the forecast range", () => {
    expect(nearestHour(series, T0 + 3 * 3_600_000 + 80 * 60_000, 90)?.tempC).toBe(3);
    expect(nearestHour(series, T0 + 5 * 3_600_000, 90)).toBeNull();
    expect(nearestHour([], T0, 90)).toBeNull();
  });
});

test("WMO codes map to kinds and Turkish labels", () => {
  expect(conditionOf(0)).toEqual({ kind: "clear", label: "Açık" });
  expect(conditionOf(45).kind).toBe("fog");
  expect(conditionOf(61)).toEqual({ kind: "rain", label: "Hafif yağmur" });
  expect(conditionOf(82).label).toBe("Şiddetli yağmur");
  expect(conditionOf(75).kind).toBe("snow");
  expect(conditionOf(96).kind).toBe("storm");
  expect(conditionOf(53).kind).toBe("drizzle");
});

test("compass names", () => {
  expect(compass(0)).toBe("K");
  expect(compass(44)).toBe("KD");
  expect(compass(180)).toBe("G");
  expect(compass(-90)).toBe("B");
  expect(compass(350)).toBe("K");
});
