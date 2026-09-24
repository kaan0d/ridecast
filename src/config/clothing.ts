import type { ClothingRule } from "../core/advice/clothing";
import type { VehicleType } from "./vehicles";

const EXPOSED: VehicleType[] = ["motorcycle", "bicycle"];
const ON_FOOT_OR_EXPOSED: VehicleType[] = ["motorcycle", "bicycle", "walking"];

// General advice per kind of condition, not single garments. Checked top to bottom against the
// worst conditions along the route; within a group only the first match shows, so the steps of
// one kind go strongest first. Names live in src/i18n (clothing.items).
export const CLOTHING: ClothingRule<VehicleType>[] = [
  { item: "freezing", group: "cold", vehicles: ON_FOOT_OR_EXPOSED, feltAtMostC: 0 },
  { item: "cold", group: "cold", vehicles: ON_FOOT_OR_EXPOSED, feltAtMostC: 5 },
  { item: "cool", group: "cold", vehicles: ON_FOOT_OR_EXPOSED, feltAtMostC: 15 },
  { item: "heat", vehicles: EXPOSED, tempAtLeastC: 28 },
  { item: "rain", vehicles: ON_FOOT_OR_EXPOSED, precipAtLeastMm: 0.1 },
  { item: "lowLight", vehicles: ON_FOOT_OR_EXPOSED, dark: true },
  { item: "lowLight", vehicles: ["motorcycle"], visibilityAtMostM: 2000 },
  { item: "wind", vehicles: EXPOSED, gustAtLeastKmh: 50 },
  { item: "snowIce", vehicles: ON_FOOT_OR_EXPOSED, snowOrIce: true },
  { item: "carWinter", vehicles: ["car"], snowOrIce: true },
  { item: "carWinter", vehicles: ["car"], feltAtMostC: 0 },
];
