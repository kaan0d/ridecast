import { DEFAULT_VEHICLE, ROAD_TYPE_RULES, SPEED_LIMITS_KMH, VEHICLES, type VehicleType } from "../config/vehicles";
import type { SpeedSetting } from "../core/eta/eta";
import type { RoadType } from "../core/route/roadType";
import type { TripState } from "../core/share/state";

export type DepartMode = "now" | "at" | "best";

export interface TripSettings {
  vehicle: VehicleType;
  speed: SpeedSetting;
  departMs: number;
  departMode: DepartMode;
}

const ROADS: RoadType[] = ["motorway", "primary", "urban"];
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Wires the vehicle / speed / departure controls. `read` gives the current settings, or an error
// message when an input is invalid. In "best" mode the departure is whatever `setBest` chose last
// (until then, the next full hour).
export function bindSettings(onChange: () => void) {
  let best: number | null = null;
  const form = $<HTMLFormElement>("settings");
  const vehicleGroup = $("vehicle");
  const avg = $<HTMLInputElement>("kmh-average");
  const road = Object.fromEntries(ROADS.map((r) => [r, $<HTMLInputElement>(`kmh-${r}`)])) as Record<RoadType, HTMLInputElement>;
  const departAt = $<HTMLInputElement>("depart-at");

  vehicleGroup.replaceChildren(
    ...Object.entries(VEHICLES).map(([k, v]) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "vehicle";
      input.value = k;
      input.checked = k === DEFAULT_VEHICLE;
      const text = document.createElement("span");
      text.textContent = v.label;
      label.append(input, text);
      return label;
    }),
  );
  for (const input of [avg, ...Object.values(road)]) {
    input.min = String(SPEED_LIMITS_KMH.min);
    input.max = String(SPEED_LIMITS_KMH.max);
  }

  const radio = (name: string) => (form.elements.namedItem(name) as RadioNodeList).value;
  const fillSpeeds = () => {
    const d = VEHICLES[radio("vehicle") as VehicleType];
    avg.value = String(d.avgKmh);
    for (const r of ROADS) road[r].value = String(d.roadKmh[r]);
  };
  const syncVisibility = () => {
    $("speed-average").hidden = radio("speed-mode") !== "average";
    $("speed-road").hidden = radio("speed-mode") !== "road";
    departAt.hidden = radio("depart") !== "at";
    $("depart-best").hidden = radio("depart") !== "best";
  };

  fillSpeeds();
  departAt.value = toLocalInput(nextHour());
  syncVisibility();

  form.addEventListener("input", (e) => {
    if ((e.target as HTMLInputElement).name === "vehicle") fillSpeeds();
    syncVisibility();
    onChange();
  });
  form.addEventListener("submit", (e) => e.preventDefault());

  const read = (): TripSettings | string => {
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
    const mode = radio("depart") as DepartMode;
    const departMs =
      mode === "now" ? Date.now() : mode === "best" ? (best ?? Math.ceil(Date.now() / 3_600_000) * 3_600_000) : new Date(departAt.value).getTime();
    if (Number.isNaN(departMs)) return "Çıkış tarihi ve saati seçin.";
    return { vehicle: radio("vehicle") as VehicleType, speed, departMs, departMode: mode };
  };

  // Puts shared settings into the form (no change event: the caller re-plans once).
  const setRadio = (name: string, value: string) => {
    const el = form.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`);
    if (el) el.checked = true;
  };
  function apply(s: Pick<TripState, "vehicle" | "speed" | "depart">) {
    setRadio("vehicle", s.vehicle);
    fillSpeeds();
    setRadio("speed-mode", s.speed.mode);
    if (s.speed.mode === "average") avg.value = String(s.speed.kmh);
    else for (const r of ROADS) road[r].value = String(s.speed[r]);
    setRadio("depart", s.depart.mode);
    if (s.depart.mode === "at") departAt.value = toLocalInput(new Date(s.depart.ms));
    best = null;
    syncVisibility();
  }

  return {
    read,
    apply,
    best: () => best,
    setBest(ms: number) {
      best = ms;
    },
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
