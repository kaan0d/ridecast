import { expect, test } from "vitest";
import { climbOf, evenDistances } from "./elevation";

test("evenDistances spans the route end to end", () => {
  expect(evenDistances(1000, 5)).toEqual([0, 250, 500, 750, 1000]);
  expect(evenDistances(0, 5)).toEqual([0]);
});

test("climbOf ignores wobbles under the noise threshold", () => {
  const d = [0, 1, 2, 3, 4, 5, 6];
  // Flat with 4 m noise: no climbing.
  expect(climbOf(d, [100, 104, 100, 103, 99, 102, 100], 10)).toMatchObject({ gainM: 0, lossM: 0 });
  // A pass: up 900 m, down 600 m, highest at the 4th point.
  const c = climbOf(d, [100, 400, 700, 1000, 800, 600, 400], 10);
  expect(c).toEqual({ gainM: 900, lossM: 600, maxM: 1000, maxAtM: 3, minM: 100 });
});
