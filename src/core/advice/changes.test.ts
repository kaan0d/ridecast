import { expect, test } from "vitest";
import { diffWarnings, type WarningSnap } from "./changes";

const H = 3_600_000;
const T0 = Date.UTC(2026, 8, 25, 5);
const limits = { nearM: 30_000, minShiftMs: 30 * 60_000, minShiftM: 10_000 };
const w = (kind: WarningSnap["kind"], level: WarningSnap["level"], fromKm: number, toKm: number, startH: number): WarningSnap => ({
  kind,
  level,
  text: kind,
  fromM: fromKm * 1000,
  toM: toKm * 1000,
  startMs: T0 + startH * H,
});

test("nothing changed: no changes, small shifts ignored", () => {
  const before = [w("rain", 2, 100, 150, 2), w("dark", 2, 0, 50, 0)];
  const now = [w("rain", 2, 105, 150, 2.2), w("dark", 2, 0, 50, 0)];
  expect(diffWarnings(before, now, limits)).toEqual([]);
});

test("rain an hour earlier, fog gone, new gusts, stronger cold", () => {
  const before = [w("rain", 2, 120, 180, 2), w("visibility", 1, 20, 40, 0.3), w("cold", 1, 200, 260, 3)];
  const now = [w("rain", 2, 60, 150, 1), w("gust", 2, 150, 200, 2.5), w("cold", 2, 190, 260, 3)];
  const c = diffWarnings(before, now, limits);
  expect(c.map((x) => x.type)).toEqual(["new", "level", "moved", "gone"]);
  expect(c[2]).toMatchObject({ type: "moved", shiftMs: -H, shiftM: -60_000 });
  expect(c[3]).toMatchObject({ type: "gone", before: { kind: "visibility" } });
});

test("runs of the same kind far apart are separate warnings", () => {
  const before = [w("rain", 1, 10, 20, 0.2)];
  const now = [w("rain", 1, 200, 220, 3)];
  expect(diffWarnings(before, now, limits).map((x) => x.type)).toEqual(["new", "gone"]);
});
