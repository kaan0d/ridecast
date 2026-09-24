import { expect, test } from "vitest";
import { cityOf } from "./photon";

test("city is the province in Türkiye, the city elsewhere", () => {
  expect(cityOf({ city: "Kadıköy", state: "İstanbul", countrycode: "TR" })).toBe("İstanbul");
  expect(cityOf({ city: "München", state: "Bayern", countrycode: "DE" })).toBe("München");
  expect(cityOf({ name: "Bolu", countrycode: "TR" })).toBeNull();
});
