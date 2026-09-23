import { DEFAULT_VEHICLE, ROAD_TYPE_RULES, SPEED_LIMITS_KMH, VEHICLES, type VehicleType } from "../config/vehicles";
import type { SpeedSetting } from "../core/eta/eta";
import type { RoadType } from "../core/route/roadType";

export interface TripSettings {
  vehicle: VehicleType;
  speed: SpeedSetting;
  departMs: number;
}

const ROADS: RoadType[] = ["motorway", "primary", "urban"];
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Wires the vehicle / speed / departure controls. Returns a reader that gives the
// current settings, or an error message when an input is invalid.
export function bindSettings(onChange: () => void): () => TripSettings | string {
  const form = $<HTMLFormElement>("settings");
  const vehicle = $<HTMLSelectElement>("vehicle");
  const avg = $<HTMLInputElement>("kmh-average");
  const road = Object.fromEntries(ROADS.map((r) => [r, $<HTMLInputElement>(`kmh-${r}`)])) as Record<RoadType, HTMLInputElement>;
  const departAt = $<HTMLInputElement>("depart-at");

  vehicle.replaceChildren(...Object.entries(VEHICLES).map(([k, v]) => new Option(v.label, k)));
  for (const input of [avg, ...Object.values(road)]) {
    input.min = String(SPEED_LIMITS_KMH.min);
    input.max = String(SPEED_LIMITS_KMH.max);
  }

  const fillSpeeds = () => {
    const d = VEHICLES[vehicle.value as VehicleType];
    avg.value = String(d.avgKmh);
    for (const r of ROADS) road[r].value = String(d.roadKmh[r]);
  };
  const radio = (name: string) => (form.elements.namedItem(name) as RadioNodeList).value;
  const syncVisibility = () => {
    $("speed-average").hidden = radio("speed-mode") !== "average";
    $("speed-road").hidden = radio("speed-mode") !== "road";
    departAt.hidden = radio("depart") !== "at";
  };

  vehicle.value = DEFAULT_VEHICLE;
  fillSpeeds();
  departAt.value = toLocalInput(nextHour());
  syncVisibility();

  form.addEventListener("input", (e) => {
    if (e.target === vehicle) fillSpeeds();
    syncVisibility();
    onChange();
  });
  form.addEventListener("submit", (e) => e.preventDefault());

  return () => {
    const kmh = (el: HTMLInputElement) => {
      const v = el.valueAsNumber;
      return v >= SPEED_LIMITS_KMH.min && v <= SPEED_LIMITS_KMH.max ? v : null;
    };
    let speed: SpeedSetting;
    if (radio("speed-mode") === "average") {
      const v = kmh(avg);
      if (v === null) return speedError();
      speed = { mode: "average", kmh: v };
    } else {
      const vals = ROADS.map((r) => kmh(road[r]));
      if (vals.some((v) => v === null)) return speedError();
      speed = { mode: "road", kmh: Object.fromEntries(ROADS.map((r, i) => [r, vals[i]])) as Record<RoadType, number>, rules: ROAD_TYPE_RULES };
    }
    // datetime-local is parsed as local time; valueAsNumber would treat it as UTC.
    const departMs = radio("depart") === "now" ? Date.now() : new Date(departAt.value).getTime();
    if (Number.isNaN(departMs)) return "Çıkış tarihi ve saati seçin.";
    return { vehicle: vehicle.value as VehicleType, speed, departMs };
  };
}

const speedError = () => `Hız ${SPEED_LIMITS_KMH.min}-${SPEED_LIMITS_KMH.max} km/s arasında olmalı.`;

function nextHour(): Date {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
}

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
