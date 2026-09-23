import { expect, test } from "vitest";
import { addRecent, parseRecent, type RecentRoute } from "./recent";

const e = (key: string, savedMs: number): RecentRoute => ({ key, title: key, hash: "v=1", savedMs });

test("addRecent puts the newest first, replaces the same trip, and caps the list", () => {
  let list: RecentRoute[] = [];
  list = addRecent(list, e("a", 1), 3);
  list = addRecent(list, e("b", 2), 3);
  list = addRecent(list, e("a", 3), 3);
  expect(list.map((r) => [r.key, r.savedMs])).toEqual([
    ["a", 3],
    ["b", 2],
  ]);
  list = addRecent(addRecent(list, e("c", 4), 3), e("d", 5), 3);
  expect(list.map((r) => r.key)).toEqual(["d", "c", "a"]);
});

test("parseRecent survives missing, broken and foreign data", () => {
  expect(parseRecent(null)).toEqual([]);
  expect(parseRecent("{nope")).toEqual([]);
  expect(parseRecent('{"a":1}')).toEqual([]);
  expect(parseRecent(JSON.stringify([e("a", 1), { key: 5 }, null]))).toEqual([e("a", 1)]);
});
