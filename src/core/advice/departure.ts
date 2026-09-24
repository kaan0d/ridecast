import type { RouteScore } from "../risk/route";

const HOUR = 3_600_000;

// Departure times to compare: from the next full hour, every `stepH` hours, within `windowH`.
export function departureCandidates(nowMs: number, windowH: number, stepH: number): number[] {
  const first = Math.ceil(nowMs / HOUR) * HOUR;
  const out: number[] = [];
  for (let t = first; t <= nowMs + windowH * HOUR; t += stepH * HOUR) out.push(t);
  return out;
}

export interface ScoredDeparture {
  departMs: number;
  arrivalMs: number;
  score: RouteScore;
}

// Lowest risk first; equal risk goes to the earlier departure. Candidates missing more than
// `maxMissing` of their forecast are left out rather than ranked on partial data, and a candidate
// closer than `minGapH` to one already picked is skipped: 08:00, 09:00 and 10:00 are one choice.
export function rankDepartures(all: ScoredDeparture[], count: number, maxMissing: number, minGapH = 0): ScoredDeparture[] {
  const picked: ScoredDeparture[] = [];
  const sorted = all.filter((d) => d.score.missingShare <= maxMissing).sort((a, b) => a.score.score - b.score.score || a.departMs - b.departMs);
  for (const d of sorted) {
    if (picked.length === count) break;
    if (picked.every((p) => Math.abs(p.departMs - d.departMs) >= minGapH * HOUR)) picked.push(d);
  }
  return picked;
}

// The best departure of each day (lowest score, ties to the earlier one), in day order. `dayOf`
// names the day of a departure in the rider's calendar; candidates missing too much forecast are
// left out as in rankDepartures.
export function bestPerDay(all: ScoredDeparture[], dayOf: (ms: number) => string, maxMissing: number): ScoredDeparture[] {
  const best = new Map<string, ScoredDeparture>();
  for (const d of all) {
    if (d.score.missingShare > maxMissing) continue;
    const key = dayOf(d.departMs);
    const b = best.get(key);
    if (!b || d.score.score < b.score.score || (d.score.score === b.score.score && d.departMs < b.departMs)) best.set(key, d);
  }
  return [...best.values()].sort((a, b) => a.departMs - b.departMs);
}
