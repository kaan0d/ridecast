import { etaAtDistance, type Timeline } from "../eta/eta";
import type { LatLon } from "../geo";
import type { Assessment, Level } from "../risk/risk";
import { haversineM } from "../route/line";

// One GPS fix mapped onto the route.
export interface Fix {
  t: number; // epoch ms of the fix
  distM: number; // along the route (timeline scale)
  offM: number; // distance from the route
}

export interface PaceRules {
  windowMs: number; // fixes older than this are ignored
  minElapsedMs: number;
  minDistM: number;
  min: number;
  max: number;
}

// Planned time for the distance actually covered, divided by the time it really took:
// 1 = on plan, above 1 = faster. Without enough recent movement the plan is trusted (1).
export function paceFactor(fixes: Fix[], tl: Timeline, rules: PaceRules): number {
  if (!fixes.length) return 1;
  const last = fixes[fixes.length - 1];
  const recent = fixes.filter((f) => last.t - f.t <= rules.windowMs);
  const first = recent[0];
  const elapsed = last.t - first.t;
  const moved = last.distM - first.distM;
  if (elapsed < rules.minElapsedMs || moved < rules.minDistM) return 1;
  const planned = etaAtDistance(tl, last.distM) - etaAtDistance(tl, first.distM);
  return Math.min(rules.max, Math.max(rules.min, planned / elapsed));
}

// The plan re-anchored at the rider's position: what is left takes (planned time / pace),
// counted from now. Boundaries behind the rider move the same way; they are not used.
export function liveTimeline(tl: Timeline, curDistM: number, nowMs: number, pace: number): Timeline {
  const base = etaAtDistance(tl, curDistM);
  const at = (t: number) => nowMs + (t - base) / pace;
  return {
    distM: tl.distM,
    timeMs: tl.timeMs.map(at),
    legArrivalMs: tl.legArrivalMs.map(at),
    breaks: tl.breaks.map((b) => ({ ...b, startMs: at(b.startMs), endMs: at(b.endMs) })),
  };
}

type RiskPoint = { distM: number; risk: Assessment | null };

// The closest point ahead with a warning at or above minLevel, and its worst event.
export function nextWarning(points: RiskPoint[], curDistM: number, minLevel: Level) {
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.distM < curDistM || !p.risk) continue;
    const e = p.risk.events.find((x) => x.level >= minLevel);
    if (e) return { index: i, aheadM: p.distM - curDistM, event: e };
  }
  return null;
}

// Warnings ahead that are new or got worse since the last check. Keys are kind + km, so a
// warning that stays put is not reported again.
export function newOrWorse(prev: Map<string, Level>, points: RiskPoint[], curDistM: number, minLevel: Level) {
  const next = new Map<string, Level>();
  const changes: { index: number; text: string; level: Level }[] = [];
  points.forEach((p, i) => {
    if (p.distM < curDistM || !p.risk) return;
    for (const e of p.risk.events) {
      if (e.level < minLevel) continue;
      const key = `${e.kind}@${Math.round(p.distM / 1000)}`;
      next.set(key, e.level);
      const before = prev.get(key);
      if (before === undefined || e.level > before) changes.push({ index: i, text: e.text, level: e.level });
    }
  });
  return { changes, next };
}

// Consecutive fixes away from the route. A fix counts as off when it is further than the
// threshold and further than its own accuracy allows; any fix back on the route resets.
export function offRouteCount(prevCount: number, offM: number, accuracyM: number, thresholdM: number): number {
  return offM > Math.max(thresholdM, accuracyM * 1.5) ? prevCount + 1 : 0;
}

// Odometer for the fuel estimate, from raw fixes (not the route, so reroutes and detours count).
// A fix counts only once it is further from the last counted one than its accuracy and minStepM,
// so GPS jitter while standing still adds nothing.
export function odometerStep(anchor: LatLon | null, p: LatLon, accuracyM: number, minStepM: number): { addM: number; anchor: LatLon } {
  if (!anchor) return { addM: 0, anchor: p };
  const d = haversineM(anchor, p);
  return d > Math.max(accuracyM, minStepM) ? { addM: d, anchor: p } : { addM: 0, anchor };
}
