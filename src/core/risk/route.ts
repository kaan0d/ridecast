import type { Level } from "./risk";

export interface RouteScore {
  score: number; // riding-time-weighted mean of the level weights along the route
  worst: Level;
  missingShare: number; // part of the riding time with no forecast (0..1)
}

// Each sample point stands for the route halfway to its neighbours, for as long as it takes to
// ride that stretch at the speed there: a slow stretch in the rain counts more than a fast one of
// the same length. Breaks do not count. Points without a forecast (level null) are left out of the
// mean and reported as missingShare.
export function routeScore(points: { distM: number; level: Level | null; kmh: number }[], totalM: number, weights: readonly number[]): RouteScore {
  const spans = points.map((p, k) => {
    const from = k === 0 ? 0 : (points[k - 1].distM + p.distM) / 2;
    const to = k === points.length - 1 ? totalM : (p.distM + points[k + 1].distM) / 2;
    return p.kmh > 0 ? (to - from) / p.kmh : 0;
  });
  const total = spans.reduce((a, b) => a + b, 0);
  let sum = 0;
  let known = 0;
  let worst: Level = 0;
  points.forEach((p, k) => {
    const share = total > 0 ? spans[k] / total : 0;
    if (p.level === null) return;
    sum += weights[p.level] * share;
    known += share;
    if (p.level > worst) worst = p.level;
  });
  return { score: known > 0 ? sum / known : 0, worst, missingShare: Math.max(0, 1 - known) };
}

export interface RouteChoice {
  safest: number; // index of the route to recommend on risk
  base: number; // the route it is compared with (the fastest)
  extraMin: number; // minutes the safest route costs over the base (negative: saves time)
  riskDrop: number; // 0..1, how much lower its score is than the base's
}

// Picks the lowest score; ties go to the faster route. Returns null when there is nothing to
// compare (fewer than two scored routes) or when no route carries any risk.
export function chooseSafest(routes: { durationS: number; score: RouteScore | null }[], minDrop: number): RouteChoice | null {
  const scored = routes.map((r, i) => ({ ...r, i })).filter((r) => r.score !== null) as { durationS: number; score: RouteScore; i: number }[];
  if (scored.length < 2) return null;
  const fastest = scored.reduce((a, b) => (b.durationS < a.durationS ? b : a));
  const safest = scored.reduce((a, b) => (b.score.score < a.score.score || (b.score.score === a.score.score && b.durationS < a.durationS) ? b : a));
  if (fastest.score.score === 0) return null;
  const drop = safest === fastest ? 0 : 1 - safest.score.score / fastest.score.score;
  // A marginal gain is not worth a detour: keep the fastest.
  const pick = drop >= minDrop ? safest : fastest;
  return {
    safest: pick.i,
    base: fastest.i,
    extraMin: Math.round((pick.durationS - fastest.durationS) / 60),
    riskDrop: pick === fastest ? 0 : drop,
  };
}

// Each point stands for the route halfway to its neighbours; neighbours with the same value merge
// into one run. Used to colour the route by risk level and to mark the dark parts.
export function pointRuns<P extends { distM: number }>(points: P[], totalM: number, value: (p: P) => number): { from: number; to: number; v: number }[] {
  const out: { from: number; to: number; v: number }[] = [];
  points.forEach((p, k) => {
    const from = k === 0 ? 0 : (points[k - 1].distM + p.distM) / 2;
    const to = k === points.length - 1 ? totalM : (p.distM + points[k + 1].distM) / 2;
    const v = value(p);
    const last = out[out.length - 1];
    if (last && last.v === v) last.to = to;
    else out.push({ from, to, v });
  });
  return out;
}
