import type { LatLon } from "../geo";

// Google encoded polyline; Valhalla uses precision 6.
export function decodePolyline(s: string, precision = 6): LatLon[] {
  const f = 10 ** precision;
  const out: LatLon[] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  const next = () => {
    let shift = 0;
    let result = 0;
    let b: number;
    do {
      b = s.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < s.length) {
    lat += next();
    lon += next();
    out.push({ lat: lat / f, lon: lon / f });
  }
  return out;
}
