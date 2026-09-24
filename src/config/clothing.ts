import type { ClothingRule } from "../core/advice/clothing";
import type { VehicleType } from "./vehicles";

const EXPOSED: VehicleType[] = ["motorcycle", "bicycle"];
const ON_FOOT_OR_EXPOSED: VehicleType[] = ["motorcycle", "bicycle", "walking"];

// Fixed clothing table. Checked top to bottom against the worst conditions along the route.
// Items are ids; their names live in src/i18n (clothing.items).
export const CLOTHING: ClothingRule<VehicleType>[] = [
  { item: "windLayer", vehicles: ON_FOOT_OR_EXPOSED, feltAtMostC: 15 },
  { item: "thermal", vehicles: ON_FOOT_OR_EXPOSED, feltAtMostC: 8 },
  { item: "neck", vehicles: EXPOSED, feltAtMostC: 8 },
  { item: "winterGloves", vehicles: ON_FOOT_OR_EXPOSED, feltAtMostC: 5 },
  { item: "heated", vehicles: ["motorcycle"], feltAtMostC: 0 },
  { item: "mesh", vehicles: EXPOSED, tempAtLeastC: 28 },
  { item: "rainSuit", vehicles: ON_FOOT_OR_EXPOSED, precipAtLeastMm: 0.1 },
  { item: "waterproofGloves", vehicles: EXPOSED, precipAtLeastMm: 0.5 },
  { item: "pinlock", vehicles: ["motorcycle"], precipAtLeastMm: 0.1 },
  { item: "pinlock", vehicles: ["motorcycle"], feltAtMostC: 5 },
  { item: "clearVisor", vehicles: ["motorcycle"], visibilityAtMostM: 2000 },
  { item: "clearVisor", vehicles: ["motorcycle"], dark: true },
  { item: "reflective", vehicles: ON_FOOT_OR_EXPOSED, dark: true },
  { item: "snug", vehicles: EXPOSED, gustAtLeastKmh: 50 },
  { item: "grippyBoots", vehicles: ON_FOOT_OR_EXPOSED, snowOrIce: true },
  { item: "winterTyres", vehicles: ["car"], snowOrIce: true },
  { item: "scraper", vehicles: ["car"], feltAtMostC: 0 },
];
