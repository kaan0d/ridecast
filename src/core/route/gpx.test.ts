import { expect, test } from "vitest";
import { parseGpx, toGpx } from "./gpx";

test("reads track points in either attribute order, skips bad ones, reads the name", () => {
  const xml = `<?xml version="1.0"?><gpx><trk><name>Sapanca &amp; Kartepe</name><trkseg>
    <trkpt lat="40.1" lon="29.1"><ele>10</ele></trkpt>
    <trkpt lon='29.2' lat='40.2'/>
    <trkpt lat="abc" lon="29.3"/>
    <trkpt lat="40.4" lon="29.4"></trkpt>
  </trkseg></trk></gpx>`;
  expect(parseGpx(xml)).toEqual({
    name: "Sapanca & Kartepe",
    points: [
      { lat: 40.1, lon: 29.1 },
      { lat: 40.2, lon: 29.2 },
      { lat: 40.4, lon: 29.4 },
    ],
  });
});

test("falls back to route points; too few points gives null", () => {
  const rte = `<gpx><rte><rtept lat="1" lon="2"/><rtept lat="3" lon="4"/></rte></gpx>`;
  expect(parseGpx(rte)?.points).toEqual([
    { lat: 1, lon: 2 },
    { lat: 3, lon: 4 },
  ]);
  expect(parseGpx(`<gpx><trk><trkseg><trkpt lat="1" lon="2"/></trkseg></trk></gpx>`)).toBeNull();
  expect(parseGpx("not xml")).toBeNull();
});

test("export then import gives the same track and name", () => {
  const track = [
    { lat: 40.99013, lon: 29.02456 },
    { lat: 40.5, lon: 29.5 },
    { lat: 39.77439, lon: 30.51912 },
  ];
  const xml = toGpx("Kadıköy → Eskişehir <test>", track, [{ pos: track[1], name: "Mola 1 · 15 dk" }]);
  expect(xml).toContain("<wpt");
  expect(parseGpx(xml)).toEqual({ name: "Kadıköy → Eskişehir <test>", points: track });
});
