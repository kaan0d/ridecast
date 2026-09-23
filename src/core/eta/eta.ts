import { guessRoadType, type RoadSpeeds, type RoadTypeRules, type Step } from "../route/roadType";

export type SpeedSetting =
  | { mode: "average"; kmh: number }
  | { mode: "road"; kmh: RoadSpeeds; rules: RoadTypeRules };

export interface Timeline {
  distM: number[]; // cumulative distance at each step boundary, starts at 0
  timeMs: number[]; // epoch ms (UTC) at each step boundary, starts at departure
  legArrivalMs: number[]; // arrival at the end of each leg
}

// Ferries keep the OSRM duration: the vehicle speed does not apply on board.
export function stepSeconds(step: Step, speed: SpeedSetting): number {
  if (step.ferry) return step.durationS;
  const kmh = speed.mode === "average" ? speed.kmh : speed.kmh[guessRoadType(step, speed.rules)];
  return step.distanceM / (kmh / 3.6);
}

export function buildTimeline(steps: Step[], departMs: number, speed: SpeedSetting): Timeline {
  const distM = [0];
  const timeMs = [departMs];
  const legArrivalMs: number[] = [];
  steps.forEach((s, i) => {
    distM.push(distM[i] + s.distanceM);
    timeMs.push(timeMs[i] + stepSeconds(s, speed) * 1000);
    legArrivalMs[s.leg] = timeMs[i + 1];
  });
  return { distM, timeMs, legArrivalMs };
}

// ETA at a distance along the route, linear inside a step. Clamped to the route ends.
export function etaAtDistance(t: Timeline, d: number): number {
  const last = t.distM.length - 1;
  if (d <= 0) return t.timeMs[0];
  if (d >= t.distM[last]) return t.timeMs[last];
  let i = 1;
  while (t.distM[i] < d) i++;
  const f = (d - t.distM[i - 1]) / (t.distM[i] - t.distM[i - 1]);
  return t.timeMs[i - 1] + f * (t.timeMs[i] - t.timeMs[i - 1]);
}
