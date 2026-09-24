import { expect, test } from "vitest";
import { toIcs } from "./ics";

const T = Date.UTC(2026, 8, 25, 5, 0, 0);

test("one event per riding day, UTC times, CRLF line ends", () => {
  const ics = toIcs(
    [
      { uid: "a@ridecast", startMs: T, endMs: T + 3 * 3_600_000, summary: "Ride: Kadıköy → Eskişehir" },
      { uid: "b@ridecast", startMs: T + 24 * 3_600_000, endMs: T + 26 * 3_600_000, summary: "Day 2" },
    ],
    T,
  );
  const lines = ics.split("\r\n");
  expect(lines[0]).toBe("BEGIN:VCALENDAR");
  expect(lines).toContain("DTSTART:20260925T050000Z");
  expect(lines).toContain("DTEND:20260925T080000Z");
  expect(lines).toContain("SUMMARY:Ride: Kadıköy → Eskişehir");
  expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(2);
  expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  expect(ics.replace(/\r\n/g, "")).not.toMatch(/\n/); // no bare LF
});

test("text escaping and folding at 75 octets without splitting characters", () => {
  const description = "Breaks: 09:00, 10:30; rain\\wind\nsecond line " + "ğ".repeat(60);
  const ics = toIcs([{ uid: "x", startMs: T, endMs: T + 1, summary: "s", description }], T);
  const enc = new TextEncoder();
  const physical = ics.split("\r\n");
  expect(physical.every((l) => enc.encode(l).length <= 75)).toBe(true);
  // Unfolding (drop CRLF + space) gives the escaped value back.
  const unfolded = ics.replace(/\r\n /g, "");
  expect(unfolded).toContain("DESCRIPTION:Breaks: 09:00\\, 10:30\\; rain\\\\wind\\nsecond line " + "ğ".repeat(60));
});
