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
