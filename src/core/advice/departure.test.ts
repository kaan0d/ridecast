import { expect, test } from "vitest";
import { departureCandidates, rankDepartures, type ScoredDeparture } from "./departure";

const H = 3_600_000;
const T0 = Date.UTC(2026, 8, 24, 5); // on the hour

test("candidates start at the next full hour and cover the window", () => {
  const c = departureCandidates(T0 + 20 * 60_000, 24, 1);
  expect(c[0]).toBe(T0 + H);
  expect(c).toHaveLength(24); // 06:00 .. 05:00 next day, within now + 24 h
  expect(c.at(-1)).toBe(T0 + 24 * H);
  expect(departureCandidates(T0, 24, 2)).toHaveLength(13); // on the hour counts, 0..24 step 2
});

test("ranking: lowest score, then earliest, without candidates missing data", () => {
  const d = (h: number, score: number, missingShare = 0): ScoredDeparture => ({
    departMs: T0 + h * H,
    arrivalMs: T0 + (h + 3) * H,
    score: { score, worst: 1, missingShare },
  });
  const ranked = rankDepartures([d(0, 2), d(1, 0.5), d(2, 0.5), d(3, 0.1, 0.6), d(4, 1)], 3, 0.25);
  expect(ranked.map((r) => r.departMs)).toEqual([T0 + H, T0 + 2 * H, T0 + 4 * H]);
});

test("ranking keeps the picks apart: neighbours of a pick are skipped", () => {
  const d = (h: number, score: number): ScoredDeparture => ({ departMs: T0 + h * H, arrivalMs: T0 + (h + 3) * H, score: { score, worst: 1, missingShare: 0 } });
  // A dry morning 06-09 and a dry evening at 18; without a gap the list would be 06, 07, 08.
  const all = [d(6, 0), d(7, 0), d(8, 0), d(9, 0.1), d(12, 2), d(18, 0.2)];
  expect(rankDepartures(all, 3, 0.25, 2).map((r) => (r.departMs - T0) / H)).toEqual([6, 8, 18]);
});
