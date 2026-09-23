// Trip settings <-> URL hash. Short keys keep shared links small; everything is validated on the
// way in, so a hand-edited or truncated link gives null instead of a half-applied trip.

export type Vehicle = "motorcycle" | "car" | "bicycle" | "walking";

export interface TripState {
  stops: { label: string; lat: number; lon: number }[];
  breaks: { lat: number; lon: number; min: number; auto: boolean }[];
  vehicle: Vehicle;
  speed: { mode: "average"; kmh: number } | { mode: "road"; motorway: number; primary: number; urban: number };
  depart: { mode: "now" } | { mode: "at"; ms: number } | { mode: "best" };
  selected: number;
}

const VEHICLE_CODE: Record<Vehicle, string> = { motorcycle: "m", car: "c", bicycle: "b", walking: "w" };
const CODE_VEHICLE = Object.fromEntries(Object.entries(VEHICLE_CODE).map(([k, v]) => [v, k])) as Record<string, Vehicle>;

const c5 = (v: number) => String(Math.round(v * 1e5) / 1e5);
// Separators inside a label would break the list format.
const cleanLabel = (s: string) => s.replace(/[;~]/g, " ").trim();

export function encodeState(s: TripState): string {
  const p = new URLSearchParams();
  p.set("v", "1");
  p.set("s", s.stops.map((x) => `${c5(x.lat)},${c5(x.lon)}~${cleanLabel(x.label)}`).join(";"));
  if (s.breaks.length) p.set("b", s.breaks.map((x) => `${c5(x.lat)},${c5(x.lon)},${x.min}${x.auto ? "a" : ""}`).join(";"));
  p.set("veh", VEHICLE_CODE[s.vehicle]);
  p.set("spd", s.speed.mode === "average" ? `a${s.speed.kmh}` : `r${s.speed.motorway},${s.speed.primary},${s.speed.urban}`);
  p.set("dep", s.depart.mode === "at" ? `at${s.depart.ms}` : s.depart.mode);
  if (s.selected > 0) p.set("r", String(s.selected));
  return p.toString();
}

const num = (v: string | undefined) => (v !== undefined && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const validLatLon = (lat: number | null, lon: number | null) => lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

export function decodeState(hash: string, limits: { minKmh: number; maxKmh: number; minBreak: number; maxBreak: number }): TripState | null {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  if (p.get("v") !== "1") return null;

  const stops: TripState["stops"] = [];
  for (const part of (p.get("s") ?? "").split(";")) {
    const [coords, ...label] = part.split("~");
    const [lat, lon] = (coords ?? "").split(",").map(num);
    if (!validLatLon(lat, lon)) return null;
    stops.push({ lat: lat!, lon: lon!, label: label.join("~") });
  }
  if (stops.length < 2) return null;

  const breaks: TripState["breaks"] = [];
  for (const part of (p.get("b") ?? "").split(";").filter(Boolean)) {
    const [la, lo, m] = part.split(",");
    const auto = m?.endsWith("a") ?? false;
    const [lat, lon, min] = [num(la), num(lo), num(auto ? m.slice(0, -1) : m)];
    if (!validLatLon(lat, lon) || min === null || min < limits.minBreak || min > limits.maxBreak) return null;
    breaks.push({ lat: lat!, lon: lon!, min, auto });
  }

  const vehicle = CODE_VEHICLE[p.get("veh") ?? ""];
  if (!vehicle) return null;

  const spd = p.get("spd") ?? "";
  const kmhOk = (v: number | null) => v !== null && v >= limits.minKmh && v <= limits.maxKmh;
  let speed: TripState["speed"];
  if (spd.startsWith("a")) {
    const kmh = num(spd.slice(1));
    if (!kmhOk(kmh)) return null;
    speed = { mode: "average", kmh: kmh! };
  } else if (spd.startsWith("r")) {
    const [motorway, primary, urban] = spd.slice(1).split(",").map(num);
    if (![motorway, primary, urban].every(kmhOk)) return null;
    speed = { mode: "road", motorway: motorway!, primary: primary!, urban: urban! };
  } else return null;

  const dep = p.get("dep") ?? "";
  let depart: TripState["depart"];
  if (dep === "now" || dep === "best") depart = { mode: dep };
  else if (dep.startsWith("at") && num(dep.slice(2)) !== null) depart = { mode: "at", ms: num(dep.slice(2))! };
  else return null;

  const r = num(p.get("r") ?? "0");
  return { stops, breaks, vehicle, speed, depart, selected: r !== null && r >= 0 && Number.isInteger(r) ? r : 0 };
}
