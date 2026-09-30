import { expect, test } from "vitest";
import { unitsOf } from "./units";

test("metric shows the app's own values", () => {
  const m = unitsOf("metric");
  expect(m.dist(273_000)).toBe("273 km");
  expect(m.dist(7_200)).toBe("7.2 km");
  expect(m.speed(80)).toBe("80 km/h");
  expect(m.temp(-0.4)).toBe("0°");
  expect(m.rain(1.25)).toBe("1.3 mm");
  expect(m.height(1520.4)).toBe("1520 m");
  expect(m.kmhFrom(80)).toBe(80);
});

test("imperial converts what is shown and what is typed", () => {
  const i = unitsOf("imperial");
  expect(i.dist(273_000)).toBe("170 mi");
  expect(i.dist(1609.344 * 7.24)).toBe("7.2 mi");
  expect(i.distWhole(100_000)).toBe(62);
  expect(i.speed(100)).toBe("62 mph");
  expect(i.temp(0)).toBe("32°");
  expect(i.temp(-40)).toBe("-40°");
  expect(i.temp(20)).toBe("68°");
  expect(i.rain(25.4)).toBe("1.00 in");
  expect(i.height(1000)).toBe("3281 ft");
  expect(i.kmhFrom(50)).toBeCloseTo(80.467, 3);
  expect(i.kmFrom(100)).toBeCloseTo(160.934, 3);
  expect(i.kmTo(160.9344)).toBeCloseTo(100, 6);
});
