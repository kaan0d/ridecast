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
// `maxMissing` of their forecast are left out rather than ranked on partial data.
export function rankDepartures(all: ScoredDeparture[], count: number, maxMissing: number): ScoredDeparture[] {
  return all
    .filter((d) => d.score.missingShare <= maxMissing)
    .sort((a, b) => a.score.score - b.score.score || a.departMs - b.departMs)
    .slice(0, count);
}
