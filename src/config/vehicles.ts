import type { RoadSpeeds, RoadTypeRules } from "../core/route/roadType";

export type VehicleType = "motorcycle" | "car" | "bicycle" | "walking";

export interface VehicleDefaults {
  label: string;
  avgKmh: number;
  roadKmh: RoadSpeeds;
}

export const VEHICLES: Record<VehicleType, VehicleDefaults> = {
  motorcycle: { label: "Motosiklet", avgKmh: 80, roadKmh: { motorway: 110, primary: 80, urban: 40 } },
  car: { label: "Araba", avgKmh: 85, roadKmh: { motorway: 120, primary: 90, urban: 45 } },
  bicycle: { label: "Bisiklet", avgKmh: 18, roadKmh: { motorway: 22, primary: 20, urban: 15 } },
  walking: { label: "Yürüyüş", avgKmh: 5, roadKmh: { motorway: 5, primary: 5, urban: 4.5 } },
};

export const DEFAULT_VEHICLE: VehicleType = "motorcycle";

export const SPEED_LIMITS_KMH = { min: 1, max: 250 };

// Road type guess from OSRM steps. Refs follow Turkish numbering (O-4 otoyol, D-100 devlet yolu);
// elsewhere the OSRM step average speed decides.
export const ROAD_TYPE_RULES: RoadTypeRules = {
  motorwayMinKmh: 90,
  primaryMinKmh: 70,
  motorwayRef: /^O-?\d/,
  primaryRef: /^D-?\d/,
};
