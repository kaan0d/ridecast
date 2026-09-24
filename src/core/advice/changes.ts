import type { Level, RiskKind } from "../risk/risk";

// One warning run along the route, as saved with a trip: what, how bad, where, when.
export interface WarningSnap {
  kind: RiskKind;
  level: Level;
  text: string;
  fromM: number;
  toM: number;
  startMs: number; // arrival at the start of the run
}

export type WarningChange =
  | { type: "new"; now: WarningSnap }
  | { type: "gone"; before: WarningSnap }
  | { type: "level"; before: WarningSnap; now: WarningSnap }
  | { type: "moved"; before: WarningSnap; now: WarningSnap; shiftMs: number; shiftM: number };

const overlap = (a: WarningSnap, b: WarningSnap) => Math.min(a.toM, b.toM) - Math.max(a.fromM, b.fromM);

// What changed between two looks at the same trip. Runs of the same kind are paired by the most
// overlap along the route (or, without overlap, the nearest start within `nearM`). A pair is a
// change when the level differs, or when its start moved at least `minShiftMs` or `minShiftM`.
export function diffWarnings(before: WarningSnap[], now: WarningSnap[], limits: { nearM: number; minShiftMs: number; minShiftM: number }): WarningChange[] {
  const out: WarningChange[] = [];
  const left = [...before];
  for (const n of now) {
    let best = -1;
    let bestScore = -Infinity;
    left.forEach((b, i) => {
      if (b.kind !== n.kind) return;
      const o = overlap(b, n);
      const score = o > 0 ? o : -Math.abs(b.fromM - n.fromM);
      if ((o > 0 || Math.abs(b.fromM - n.fromM) <= limits.nearM) && score > bestScore) {
        best = i;
        bestScore = score;
      }
    });
    if (best < 0) {
      out.push({ type: "new", now: n });
      continue;
    }
    const b = left.splice(best, 1)[0];
    const shiftMs = n.startMs - b.startMs;
    const shiftM = n.fromM - b.fromM;
    if (b.level !== n.level) out.push({ type: "level", before: b, now: n });
    else if (Math.abs(shiftMs) >= limits.minShiftMs || Math.abs(shiftM) >= limits.minShiftM) out.push({ type: "moved", before: b, now: n, shiftMs, shiftM });
  }
  for (const b of left) out.push({ type: "gone", before: b });
  // Worse news first: new and stronger warnings, then moves, then what went away.
  const rank = (c: WarningChange) => (c.type === "new" ? 0 : c.type === "level" ? (c.now.level > c.before.level ? 0 : 2) : c.type === "moved" ? 1 : 3);
  return out.sort((a, b) => rank(a) - rank(b));
}
