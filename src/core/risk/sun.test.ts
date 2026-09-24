import { expect, test } from "vitest";
import { angleBetween, sunPosition } from "./sun";

// Reference: Open-Meteo sunrise/sunset (forecast and archive APIs, 2026-09-24 fetch), at the grid
// point the API answered for. Sunrise and sunset are where the geometric elevation is -0.833°
// (refraction plus the sun's radius).
const S = 1000;

test("elevation is -0.833° at Open-Meteo sunrise and sunset", () => {
  const cases: [number, number, number][] = [
    [41.0, 29.0, 1790221997], // Istanbul 2026-09-24 sunrise
    [41.0, 29.0, 1790265492], // sunset
    [39.75, 30.5, 1790221638], // Eskişehir 2026-09-24 sunrise
    [41.01933, 29.015692, 1750473110], // Istanbul 2025-06-21 sunrise
    [41.01933, 29.015692, 1750527576], // sunset
    [41.01933, 29.015692, 1766294719], // Istanbul 2025-12-21 sunrise
  ];
  // Measured: -0.817 to -0.854, so within 0.05°.
  for (const [lat, lon, t] of cases) expect(sunPosition(t * S, lat, lon).elevationDeg).toBeCloseTo(-0.833, 1);
});

test("sunrise is in the east, sunset in the west; midsummer noon height is 90 - lat + tilt", () => {
  const rise = sunPosition(1790221997 * S, 41, 29);
  const set = sunPosition(1790265492 * S, 41, 29);
  // Near the equinox the sun rises almost due east and sets almost due west.
  expect(angleBetween(rise.azimuthDeg, 90)).toBeLessThan(3);
  expect(angleBetween(set.azimuthDeg, 270)).toBeLessThan(3);
  // 2025-06-21 around local solar noon (29° E: 10:04 UTC): highest point.
  let best = { elevationDeg: -90, azimuthDeg: 0 };
  for (let m = 0; m < 120; m++) {
    const p = sunPosition(Date.UTC(2025, 5, 21, 9, m), 41.01933, 29.015692);
    if (p.elevationDeg > best.elevationDeg) best = p;
  }
  expect(best.elevationDeg).toBeCloseTo(90 - 41.01933 + 23.44, 0);
  expect(angleBetween(best.azimuthDeg, 180)).toBeLessThan(1.5);
});

test("midnight sun: Tromsø stays above the horizon at midnight in June", () => {
  // Archive API: sunrise and sunset at the day's bounds (polar day). The lowest point, at local
  // solar midnight (about 22:44 UTC at 19° E), is 23.44 - (90 - 69.63) ≈ 3.07°.
  let low = 90;
  for (let m = 0; m < 24 * 60; m += 2) low = Math.min(low, sunPosition(1750464000 * S + m * 60_000, 69.63093, 18.979591).elevationDeg);
  expect(low).toBeCloseTo(3.07, 0);
});

test("angle between bearings wraps around north", () => {
  expect(angleBetween(350, 10)).toBe(20);
  expect(angleBetween(10, 350)).toBe(20);
  expect(angleBetween(90, 270)).toBe(180);
});
