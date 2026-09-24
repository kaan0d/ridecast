import type { LatLon } from "../geo";

const R = 6371008.8; // mean Earth radius, m
const RAD = Math.PI / 180;

export function haversineM(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface Line {
  coords: LatLon[];
  cumM: number[]; // distance from the start at each vertex
}

export function makeLine(coords: LatLon[]): Line {
  const cumM = [0];
  for (let i = 1; i < coords.length; i++) cumM.push(cumM[i - 1] + haversineM(coords[i - 1], coords[i]));
  return { coords, cumM };
}

export const lineLength = (line: Line) => line.cumM[line.cumM.length - 1];

// Nearest point on the line. Projection uses a local flat approximation per segment,
// fine at road-segment scale.
// ponytail: O(n) scan per call; add a spatial index if drag snapping gets slow on very long routes.
export function snapToLine(line: Line, p: LatLon): { pos: LatLon; distM: number } {
  const { coords, cumM } = line;
  if (coords.length === 1) return { pos: coords[0], distM: 0 };
  let best = { d2: Infinity, pos: coords[0], distM: 0 };
  const kx = Math.cos(p.lat * RAD);
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const bx = (b.lon - a.lon) * kx;
    const by = b.lat - a.lat;
    const px = (p.lon - a.lon) * kx;
    const py = p.lat - a.lat;
    const len2 = bx * bx + by * by;
    const t = len2 > 0 ? Math.min(1, Math.max(0, (px * bx + py * by) / len2)) : 0;
    const d2 = (px - t * bx) ** 2 + (py - t * by) ** 2;
    if (d2 < best.d2) {
      best = {
        d2,
        pos: { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) },
        distM: cumM[i - 1] + t * (cumM[i] - cumM[i - 1]),
      };
    }
  }
  return { pos: best.pos, distM: best.distM };
}

export function pointAtDistance(line: Line, d: number): LatLon {
  const { coords, cumM } = line;
  if (d <= 0) return coords[0];
  const last = coords.length - 1;
  if (d >= cumM[last]) return coords[last];
  let i = 1;
  while (cumM[i] < d) i++;
  const f = (d - cumM[i - 1]) / (cumM[i] - cumM[i - 1]);
  const a = coords[i - 1];
  const b = coords[i];
  return { lat: a.lat + f * (b.lat - a.lat), lon: a.lon + f * (b.lon - a.lon) };
}

// The part of the line between two distances, including the cut points.
export function sliceLine(line: Line, from: number, to: number): LatLon[] {
  const a = Math.max(0, Math.min(from, to));
  const b = Math.min(lineLength(line), Math.max(from, to));
  const out = [pointAtDistance(line, a)];
  for (let i = 0; i < line.coords.length; i++) if (line.cumM[i] > a && line.cumM[i] < b) out.push(line.coords[i]);
  out.push(pointAtDistance(line, b));
  return out;
}

// Direction of travel at a distance, degrees clockwise from north, over a short window.
export function bearingAt(line: Line, d: number, windowM = 100): number {
  const len = lineLength(line);
  const p = pointAtDistance(line, Math.max(0, Math.min(len - windowM, d - windowM / 2)));
  const q = pointAtDistance(line, Math.min(len, Math.max(windowM, d + windowM / 2)));
  const y = Math.sin((q.lon - p.lon) * RAD) * Math.cos(q.lat * RAD);
  const x = Math.cos(p.lat * RAD) * Math.sin(q.lat * RAD) - Math.sin(p.lat * RAD) * Math.cos(q.lat * RAD) * Math.cos((q.lon - p.lon) * RAD);
  return ((Math.atan2(y, x) / RAD) + 360) % 360;
}

// Where to put a route's label: the point in the middle 60% of the line that is farthest from the
// other routes, so labels of overlapping alternatives sit on their own stretch. Midpoint when alone.
export function labelPoint(line: Line, others: Line[], samples = 30): LatLon {
  const len = lineLength(line);
  if (!others.length) return pointAtDistance(line, len / 2);
  let best = { gap: -1, pos: pointAtDistance(line, len / 2) };
  for (let k = 0; k <= samples; k++) {
    const pos = pointAtDistance(line, len * (0.2 + (0.6 * k) / samples));
    const gap = Math.min(...others.map((o) => haversineM(pos, snapToLine(o, pos).pos)));
    if (gap > best.gap) best = { gap, pos };
  }
  return best.pos;
}
