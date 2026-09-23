import type { ClothingRule } from "../core/advice/clothing";
import type { VehicleType } from "./vehicles";

const EXPOSED: VehicleType[] = ["motorcycle", "bicycle"];
const ON_FOOT_OR_EXPOSED: VehicleType[] = ["motorcycle", "bicycle", "walking"];

// Fixed clothing table. Checked top to bottom against the worst conditions along the route.
export const CLOTHING: ClothingRule<VehicleType>[] = [
  { item: "Rüzgar geçirmez dış katman", vehicles: ON_FOOT_OR_EXPOSED, feltAtMostC: 15 },
  { item: "Termal içlik (alt ve üst)", vehicles: ON_FOOT_OR_EXPOSED, feltAtMostC: 8 },
  { item: "Boyunluk", vehicles: EXPOSED, feltAtMostC: 8 },
  { item: "Kışlık eldiven", vehicles: ON_FOOT_OR_EXPOSED, feltAtMostC: 5 },
  { item: "Isıtmalı eldiven veya yelek", vehicles: ["motorcycle"], feltAtMostC: 0 },
  { item: "Havalandırmalı (fileli) mont ve bol su", vehicles: EXPOSED, tempAtLeastC: 28 },
  { item: "Yağmurluk (üst ve alt)", vehicles: ON_FOOT_OR_EXPOSED, precipAtLeastMm: 0.1 },
  { item: "Su geçirmez eldiven ve bot kılıfı", vehicles: EXPOSED, precipAtLeastMm: 0.5 },
  { item: "Buğu önleyici (pinlock) vizör", vehicles: ["motorcycle"], precipAtLeastMm: 0.1 },
  { item: "Buğu önleyici (pinlock) vizör", vehicles: ["motorcycle"], feltAtMostC: 5 },
  { item: "Şeffaf veya açık renkli vizör", vehicles: ["motorcycle"], visibilityAtMostM: 2000 },
  { item: "Şeffaf veya açık renkli vizör", vehicles: ["motorcycle"], dark: true },
  { item: "Yansıtıcı yelek veya bant", vehicles: ON_FOOT_OR_EXPOSED, dark: true },
  { item: "Vücuda oturan, sallanmayan kıyafet; yükü sabitle", vehicles: EXPOSED, gustAtLeastKmh: 50 },
  { item: "Kaymaz tabanlı bot", vehicles: ON_FOOT_OR_EXPOSED, snowOrIce: true },
  { item: "Kış lastiği veya zincir", vehicles: ["car"], snowOrIce: true },
  { item: "Buz kazıyıcı", vehicles: ["car"], feltAtMostC: 0 },
];
