// Height along the route: where to sample it and how much it climbs.

export interface Climb {
  gainM: number;
  lossM: number;
  maxM: number;
  maxAtM: number; // distance of the highest point from the start
  minM: number;
}

// `n` distances (m) from start to end inclusive, evenly spaced.
export function evenDistances(totalM: number, n: number): number[] {
  if (!(totalM > 0) || n < 2) return [0];
  return Array.from({ length: n }, (_, i) => (totalM * i) / (n - 1));
}

// Climb and descent with hysteresis: a change counts once it reaches `noiseM` from the last point
// that counted, so small wobbles of the terrain model on flat ground add nothing.
export function climbOf(distsM: number[], heightsM: number[], noiseM: number): Climb {
  let gainM = 0;
  let lossM = 0;
  let ref = heightsM[0] ?? 0;
  let maxI = 0;
  heightsM.forEach((h, i) => {
    if (h > heightsM[maxI]) maxI = i;
    if (h - ref >= noiseM) (gainM += h - ref), (ref = h);
    else if (ref - h >= noiseM) (lossM += ref - h), (ref = h);
  });
  return { gainM, lossM, maxM: heightsM[maxI] ?? 0, maxAtM: distsM[maxI] ?? 0, minM: Math.min(...heightsM) };
}
