import { expect, test } from "vitest";
import html from "../../index.html?raw";
import { en } from "./en";
import { tr } from "./tr";

test("every data-t key of index.html has a Turkish text", () => {
  const keys = [...html.matchAll(/data-t(?:-aria|-title)?="([^"]+)"/g)].map((m) => m[1]);
  expect(keys.length).toBeGreaterThan(40);
  expect(keys.filter((k) => !tr.html[k])).toEqual([]);
});

test("both languages name the same clothing items and conditions", () => {
  expect(Object.keys(tr.clothing.items).sort()).toEqual(Object.keys(en.clothing.items).sort());
  expect(Object.keys(tr.conditions).sort()).toEqual(Object.keys(en.conditions).sort());
});

test("warning texts in both languages", () => {
  expect(en.risk.rain(2, 1.2, 40)).toBe("Rain 1.2 mm/h · 40% likely");
  expect(tr.risk.rain(2, 1.2, 40)).toBe("Yağmur 1.2 mm/sa · olasılık %40");
  expect(en.duration(3, 25)).toBe("3 h 25 min");
  expect(tr.duration(0, 15)).toBe("15 dk");
});
