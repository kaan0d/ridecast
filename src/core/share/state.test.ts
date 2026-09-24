import { expect, test } from "vitest";
import { decodeState, encodeState, type TripState } from "./state";

const limits = { minKmh: 1, maxKmh: 250, minBreak: 1, maxBreak: 600 };

const trip: TripState = {
  stops: [
    { label: "Kadıköy, İstanbul", lat: 40.990_123_4, lon: 29.028_987_6 },
    { label: "Bursa; Osmangazi", lat: 40.18, lon: 29.06 },
    { label: "Eskişehir", lat: 39.7767, lon: 30.5206 },
  ],
  breaks: [
    { lat: 40.43, lon: 29.72, min: 15, auto: false },
    { lat: 40.1, lon: 29.9, min: 10, auto: true },
    { lat: 39.9, lon: 30.2, min: 15, auto: false, resumeMin: 480 },
  ],
  vehicle: "motorcycle",
  speed: { mode: "road", motorway: 110, primary: 80, urban: 40 },
  depart: { mode: "at", ms: Date.UTC(2026, 8, 24, 5) },
  avoid: { highways: true, tolls: false, ferries: true },
  selected: 1,
};

test("round trip keeps every setting (coordinates to 5 decimals, label separators removed)", () => {
  const back = decodeState("#" + encodeState(trip), limits)!;
  expect(back.stops[0]).toEqual({ label: "Kadıköy, İstanbul", lat: 40.99012, lon: 29.02899 });
  expect(back.stops[1].label).toBe("Bursa  Osmangazi");
  expect(back.breaks).toEqual(trip.breaks);
  expect(back.vehicle).toBe("motorcycle");
  expect(back.speed).toEqual(trip.speed);
  expect(back.depart).toEqual(trip.depart);
  expect(back.avoid).toEqual(trip.avoid);
  expect(encodeState(trip)).toContain("av=hf");
  expect(back.selected).toBe(1);
});

test("links without avoid options (older links) avoid nothing; unknown letters are rejected", () => {
  const p = new URLSearchParams(encodeState(trip));
  p.delete("av");
  expect(decodeState(p.toString(), limits)?.avoid).toEqual({ highways: false, tolls: false, ferries: false });
  p.set("av", "hx");
  expect(decodeState(p.toString(), limits)).toBeNull();
});

test("average speed, now and best departures, no breaks", () => {
  const s: TripState = { ...trip, breaks: [], speed: { mode: "average", kmh: 80 }, depart: { mode: "best" }, selected: 0, vehicle: "car" };
  const enc = encodeState(s);
  expect(enc).not.toContain("b=");
  expect(enc).not.toContain("r=");
  expect(decodeState(enc, limits)).toMatchObject({ breaks: [], speed: { mode: "average", kmh: 80 }, depart: { mode: "best" }, vehicle: "car" });
  expect(decodeState(encodeState({ ...s, depart: { mode: "now" } }), limits)?.depart).toEqual({ mode: "now" });
});

test("broken or tampered links give null", () => {
  const good = encodeState(trip);
  const swap = (k: string, v: string) => {
    const p = new URLSearchParams(good);
    p.set(k, v);
    return p.toString();
  };
  expect(decodeState("", limits)).toBeNull();
  expect(decodeState(swap("v", "2"), limits)).toBeNull();
  expect(decodeState(swap("s", "40,29~only one"), limits)).toBeNull();
  expect(decodeState(swap("s", "95,29~a;40,29~b"), limits)).toBeNull(); // latitude out of range
  expect(decodeState(swap("spd", "a900"), limits)).toBeNull();
  expect(decodeState(swap("spd", "r110,80"), limits)).toBeNull();
  expect(decodeState(swap("b", "40,29,0"), limits)).toBeNull(); // break shorter than the minimum
  expect(decodeState(swap("b", "40,29,15n1500"), limits)).toBeNull(); // resume minute past midnight
  expect(decodeState(swap("b", "40,29,15x"), limits)).toBeNull();
  expect(decodeState(swap("veh", "x"), limits)).toBeNull();
  expect(decodeState(swap("dep", "tomorrow"), limits)).toBeNull();
  expect(decodeState(swap("r", "-1"), limits)?.selected).toBe(0);
});
