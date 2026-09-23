import { describe, expect, test } from "vitest";
import type { Assessment } from "../risk/risk";
import type { WeatherHour } from "../weather/weather";
import { clothingFor, summarize, type ClothingRule, type RouteConditions } from "./clothing";

const rules: ClothingRule<"moto" | "car">[] = [
  { item: "wind layer", vehicles: ["moto"], feltAtMostC: 15 },
  { item: "thermal", vehicles: ["moto"], feltAtMostC: 8 },
  { item: "rain suit", vehicles: ["moto"], precipAtLeastMm: 0.1 },
  { item: "clear visor", vehicles: ["moto"], dark: true },
  { item: "chains", vehicles: ["car"], snowOrIce: true },
];

const calm: RouteConditions = {
  minFeltC: 20,
  maxTempC: 24,
  maxPrecipMm: 0,
  wetRoad: false,
  maxGustKmh: 15,
  minVisibilityM: 20_000,
  dark: false,
  snow: false,
  ice: false,
};

describe("clothingFor", () => {
  test("a warm dry day needs nothing", () => {
    expect(clothingFor(calm, "moto", rules)).toEqual([]);
  });

  test("the list grows with the worst conditions and says why", () => {
    const list = clothingFor({ ...calm, minFeltC: 4.4, maxPrecipMm: 1.2, dark: true }, "moto", rules);
    expect(list.map((i) => i.item)).toEqual(["wind layer", "thermal", "rain suit", "clear visor"]);
    expect(list[1].why).toBe("hissedilen en düşük 4°");
    expect(list[2].why).toBe("yağış 1.2 mm/sa");
  });

  test("a wet road left by earlier rain also asks for rain gear", () => {
    expect(clothingFor({ ...calm, wetRoad: true }, "moto", rules)).toEqual([{ item: "rain suit", why: "ıslak yol" }]);
  });

  test("an item from two rules shows once with both reasons", () => {
    const twice: ClothingRule<"moto">[] = [
      { item: "visor", vehicles: ["moto"], precipAtLeastMm: 0.1 },
      { item: "visor", vehicles: ["moto"], feltAtMostC: 5 },
    ];
    expect(clothingFor({ ...calm, maxPrecipMm: 1, minFeltC: 2 }, "moto", twice)).toEqual([{ item: "visor", why: "yağış 1.0 mm/sa, hissedilen en düşük 2°" }]);
  });

  test("rules only apply to their vehicles", () => {
    const cold = { ...calm, minFeltC: 0, snow: true };
    expect(clothingFor(cold, "car", rules).map((i) => i.item)).toEqual(["chains"]);
  });
});

test("summarize takes the worst value of each kind and skips points without data", () => {
  const hour = (o: Partial<WeatherHour>): WeatherHour => ({
    timeMs: 0,
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
    ...o,
  });
  const risk = (o: Partial<Assessment>): Assessment => ({ level: 0, events: [], feltC: 15, road: "dry", dark: false, ...o });
  const c = summarize([
    { hour: hour({ tempC: 18, precipMm: 0.4 }), risk: risk({ feltC: 12 }) },
    { hour: hour({ tempC: 9, gustKmh: 40 }), risk: risk({ feltC: 3, road: "wet", dark: true }) },
    { hour: null, risk: null },
  ]);
  expect(c).toMatchObject({ minFeltC: 3, maxTempC: 18, maxPrecipMm: 0.4, wetRoad: true, maxGustKmh: 40, dark: true, snow: false, ice: false });
  expect(summarize([{ hour: null, risk: null }])).toBeNull();
});
