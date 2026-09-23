// Road type is a guess from OSRM step data: the demo server gives no road class field.

export type RoadType = "motorway" | "primary" | "urban";
export type RoadSpeeds = Record<RoadType, number>;

export interface RoadTypeRules {
  motorwayMinKmh: number;
  primaryMinKmh: number;
  motorwayRef: RegExp;
  primaryRef: RegExp;
}

export interface Step {
  distanceM: number;
  durationS: number; // OSRM car estimate
  ref: string;
  ferry: boolean;
  leg: number; // index of the leg (stop i to stop i+1)
}

export function guessRoadType(step: Step, rules: RoadTypeRules): RoadType {
  const kmh = step.durationS > 0 ? (step.distanceM / step.durationS) * 3.6 : 0;
  if (rules.motorwayRef.test(step.ref) || kmh >= rules.motorwayMinKmh) return "motorway";
  if (rules.primaryRef.test(step.ref) || kmh >= rules.primaryMinKmh) return "primary";
  return "urban";
}

// Distance per road type in meters; ferries counted apart.
export function roadBreakdown(steps: Step[], rules: RoadTypeRules): Record<RoadType | "ferry", number> {
  const out = { motorway: 0, primary: 0, urban: 0, ferry: 0 };
  for (const s of steps) out[s.ferry ? "ferry" : guessRoadType(s, rules)] += s.distanceM;
  return out;
}
