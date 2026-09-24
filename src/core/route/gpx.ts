import type { LatLon } from "../geo";

export interface GpxData {
  name: string;
  points: LatLon[]; // track points, else route points
}

const LAT = /\blat\s*=\s*["']([^"']*)["']/;
const LON = /\blon\s*=\s*["']([^"']*)["']/;
const num = (tag: string, re: RegExp) => {
  const m = tag.match(re);
  return m ? Number(m[1]) : NaN;
};

const unescape = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

// Reads the track (trkpt) of a GPX file, or its route (rtept) when it has no track. Plain text
// scanning, no DOM, so it runs in core and in tests. Null when there are fewer than two points.
export function parseGpx(xml: string): GpxData | null {
  const read = (tags: RegExp) =>
    [...xml.matchAll(tags)]
      .map((m) => ({ lat: num(m[0], LAT), lon: num(m[0], LON) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180);
  const trk = read(/<trkpt\b[^>]*>/g);
  const points = trk.length >= 2 ? trk : read(/<rtept\b[^>]*>/g);
  if (points.length < 2) return null;
  const name = xml.match(/<(?:trk|rte|metadata)\b[^>]*>\s*<name>([\s\S]*?)<\/name>/)?.[1];
  return { name: name ? unescape(name).trim() : "", points };
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const c = (v: number) => v.toFixed(6);

// GPX 1.1 with the route as a track and stops/breaks as waypoints.
export function toGpx(name: string, track: LatLon[], waypoints: { pos: LatLon; name: string }[]): string {
  const wpts = waypoints.map((w) => `  <wpt lat="${c(w.pos.lat)}" lon="${c(w.pos.lon)}"><name>${escape(w.name)}</name></wpt>`);
  const pts = track.map((p) => `      <trkpt lat="${c(p.lat)}" lon="${c(p.lon)}"/>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="ridecast" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <metadata><name>${escape(name)}</name></metadata>`,
    ...wpts,
    `  <trk><name>${escape(name)}</name><trkseg>`,
    ...pts,
    "  </trkseg></trk>",
    "</gpx>",
    "",
  ].join("\n");
}
