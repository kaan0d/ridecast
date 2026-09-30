// How much of a route winds: the stretches a rider would call bends, not the odd corner in town.
import type { LatLon } from "../geo";
import type { Line } from "./line";

const RAD = Math.PI / 180;

export interface CurveRules {
  pieceM: number; // the line is walked in pieces of this length
  turnDeg: number; // a piece bends when its direction differs this much from the previous one
  minRunPieces: number; // bends count only in runs this long (a town corner is one or two pieces)
  maxGapPieces: number; // straight pieces a run may hold between bends
}

const bearing = (p: LatLon, q: LatLon) => {
  const y = Math.sin((q.lon - p.lon) * RAD) * Math.cos(q.lat * RAD);
  const x = Math.cos(p.lat * RAD) * Math.sin(q.lat * RAD) - Math.sin(p.lat * RAD) * Math.cos(q.lat * RAD) * Math.cos((q.lon - p.lon) * RAD);
  return Math.atan2(y, x) / RAD;
};

// Points every `stepM` along the line, in one pass.
function resample(line: Line, stepM: number): LatLon[] {
  const { coords, cumM } = line;
  const out: LatLon[] = [];
  let i = 0;
  for (let d = 0; d <= cumM[cumM.length - 1]; d += stepM) {
    while (i < cumM.length - 2 && cumM[i + 1] < d) i++;
    const seg = cumM[i + 1] - cumM[i];
    const f = seg > 0 ? (d - cumM[i]) / seg : 0;
    out.push({ lat: coords[i].lat + (coords[i + 1].lat - coords[i].lat) * f, lon: coords[i].lon + (coords[i + 1].lon - coords[i].lon) * f });
  }
  return out;
}

// Metres of the line in winding stretches: runs of bending pieces (with short straights between)
// at least `minRunPieces` long.
export function curvyDistance(line: Line, rules: CurveRules): number {
  if (line.coords.length < 2) return 0;
  const pts = resample(line, rules.pieceM);
  const bends: boolean[] = [];
  let prev: number | null = null;
  for (let k = 1; k < pts.length; k++) {
    const b = bearing(pts[k - 1], pts[k]);
    const turn = prev === null ? 0 : Math.abs(((b - prev + 540) % 360) - 180);
    bends.push(turn >= rules.turnDeg);
    prev = b;
  }
  let total = 0;
  let start = -1; // first bend of the current run
  let last = -1; // last bend of the current run
  const close = () => {
    if (start >= 0 && last - start + 1 >= rules.minRunPieces) total += (last - start + 1) * rules.pieceM;
  };
  bends.forEach((bent, k) => {
    if (!bent) return;
    if (start < 0 || k - last - 1 > rules.maxGapPieces) (close(), (start = k));
    last = k;
  });
  close();
  return total;
}
