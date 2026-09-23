import { guessRoadType, type RoadSpeeds, type RoadTypeRules, type Step } from "../route/roadType";

export type SpeedSetting =
  | { mode: "average"; kmh: number }
  | { mode: "road"; kmh: RoadSpeeds; rules: RoadTypeRules };

export interface Break {
  distM: number; // distance along the route (same scale as step distances)
  durationS: number;
}

export interface Timeline {
  // Distance and time at each boundary: step ends, plus the start and end of each break
  // (a break is two points with the same distance). Starts at departure.
  distM: number[];
  timeMs: number[]; // epoch ms (UTC)
  legArrivalMs: number[]; // arrival at the end of each leg
  breaks: { distM: number; startMs: number; endMs: number }[]; // sorted by distance
}

// Ferries keep the OSRM duration: the vehicle speed does not apply on board.
export function stepSeconds(step: Step, speed: SpeedSetting): number {
  if (step.ferry) return step.durationS;
  const kmh = speed.mode === "average" ? speed.kmh : speed.kmh[guessRoadType(step, speed.rules)];
  return step.distanceM / (kmh / 3.6);
}

// Breaks past the end of the route are dropped. A break exactly at a stop starts after the arrival.
export function buildTimeline(steps: Step[], departMs: number, speed: SpeedSetting, breaks: Break[] = []): Timeline {
  const pending = [...breaks].sort((a, b) => a.distM - b.distM);
  const out: Timeline = { distM: [0], timeMs: [departMs], legArrivalMs: [], breaks: [] };
  let d = 0;
  let t = departMs;
  const push = () => {
    out.distM.push(d);
    out.timeMs.push(t);
  };
  for (const s of steps) {
    const stepMs = stepSeconds(s, speed) * 1000;
    const start = d;
    const end = start + s.distanceM;
    // Time for the part of this step from d to x.
    const advance = (x: number) => {
      t += s.distanceM > 0 ? (stepMs * (x - d)) / s.distanceM : 0;
      d = x;
    };
    while (pending.length && pending[0].distM < end) {
      const b = pending.shift()!;
      const at = Math.max(b.distM, start);
      if (at > d) {
        advance(at);
        push();
      }
      const startMs = t;
      t += b.durationS * 1000;
      push();
      out.breaks.push({ distM: d, startMs, endMs: t });
    }
    advance(end);
    if (s.distanceM === 0) t += stepMs;
    push();
    out.legArrivalMs[s.leg] = t;
  }
  return out;
}

const lastOf = (a: number[]) => a[a.length - 1];

// ETA at a distance along the route, linear between boundaries. Clamped to the route ends.
// At a break position it returns the arrival (break start).
export function etaAtDistance(t: Timeline, d: number): number {
  if (d <= 0) return t.timeMs[0];
  if (d >= lastOf(t.distM)) return lastOf(t.timeMs);
  let i = 1;
  while (t.distM[i] < d) i++;
  const f = (d - t.distM[i - 1]) / (t.distM[i] - t.distM[i - 1]);
  return t.timeMs[i - 1] + f * (t.timeMs[i] - t.timeMs[i - 1]);
}

// Distance reached at a moment, on a timeline without breaks (time strictly grows).
export function distanceAtTime(t: Timeline, ms: number): number {
  if (ms <= t.timeMs[0]) return 0;
  if (ms >= lastOf(t.timeMs)) return lastOf(t.distM);
  let i = 1;
  while (t.timeMs[i] < ms) i++;
  const f = (ms - t.timeMs[i - 1]) / (t.timeMs[i] - t.timeMs[i - 1]);
  return t.distM[i - 1] + f * (t.distM[i] - t.distM[i - 1]);
}

export type AutoBreakRule = { every: number; unit: "km" | "min" };

// Break positions every N km, or every N minutes of riding. `ride` must be built without breaks.
export function autoBreakDistances(ride: Timeline, rule: AutoBreakRule): number[] {
  const out: number[] = [];
  if (!(rule.every > 0)) return out;
  if (rule.unit === "km") {
    const total = lastOf(ride.distM);
    for (let d = rule.every * 1000; d < total; d += rule.every * 1000) out.push(d);
  } else {
    const endMs = lastOf(ride.timeMs);
    for (let ms = ride.timeMs[0] + rule.every * 60_000; ms < endMs; ms += rule.every * 60_000) out.push(distanceAtTime(ride, ms));
  }
  return out;
}

// Moving speed (km/h) at a distance: the slope of the timeline, ignoring break boundaries.
export function speedAtDistance(t: Timeline, d: number): number {
  const last = t.distM.length - 1;
  const clamped = Math.min(Math.max(d, 0), lastOf(t.distM));
  let i = 1;
  while (i < last && (t.distM[i] < clamped || t.distM[i] === t.distM[i - 1])) i++;
  // Step back over zero-length boundaries (a break, a zero-distance step) to a moving segment.
  while (i > 1 && t.distM[i] === t.distM[i - 1]) i--;
  const dd = t.distM[i] - t.distM[i - 1];
  const dt = t.timeMs[i] - t.timeMs[i - 1];
  return dd > 0 && dt > 0 ? (dd / dt) * 3600 : 0;
}
