import type { VehicleType } from "./vehicles";

// Winding road ("bends") measure for motorcycles. Tuned on real OSRM routes: a 21 km Istanbul city
// route gives 3 km, Kadıköy-Eskişehir 7 of 273 km, the Antalya-Kaş coast road 22 of 186 km.
export const CURVES = {
  pieceM: 100,
  turnDeg: 15, // ~380 m radius or tighter
  minRunPieces: 10, // 1 km of sustained bends; interchanges and town corners are shorter
  maxGapPieces: 1,
  vehicles: ["motorcycle"] as VehicleType[],
};
