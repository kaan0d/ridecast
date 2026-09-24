const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

// Sun position from the NOAA solar calculator equations (low-precision ephemeris, good to a few
// hundredths of a degree for this century). Geometric elevation, no refraction.
// azimuthDeg: clockwise from north, like a route bearing.
export function sunPosition(ms: number, lat: number, lon: number): { elevationDeg: number; azimuthDeg: number } {
  const jd = ms / 86_400_000 + 2440587.5;
  const t = (jd - 2451545) / 36525;
  const l0 = (((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360) + 360) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c =
    Math.sin(m * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * t) + Math.sin(3 * m * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * t;
  const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eqTimeMin =
    4 *
    DEG *
    (y * Math.sin(2 * l0 * RAD) -
      2 * e * Math.sin(m * RAD) +
      4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD) -
      0.5 * y * y * Math.sin(4 * l0 * RAD) -
      1.25 * e * e * Math.sin(2 * m * RAD));
  const minutesUtc = (((ms % 86_400_000) + 86_400_000) % 86_400_000) / 60_000;
  const hourAngle = ((minutesUtc + eqTimeMin + 4 * lon) / 4 - 180) * RAD;
  const phi = lat * RAD;
  const cosZenith = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(hourAngle);
  const elevationDeg = 90 - Math.acos(Math.min(1, Math.max(-1, cosZenith))) * DEG;
  const az = Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) * DEG + 180;
  return { elevationDeg, azimuthDeg: ((az % 360) + 360) % 360 };
}

// Smallest angle between two bearings, 0..180.
export const angleBetween = (a: number, b: number) => {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
};
