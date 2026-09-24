// MapLibre and its Leaflet bridge, most of the app's JavaScript: loaded on demand, only when the
// vector map shows (ui/layers.ts).
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import { addProtocol, setWorkerUrl } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre looks for its worker next to its own file, which bundling moves; Vite builds the worker
// as a file of its own and gives its URL.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

setWorkerUrl(workerUrl);
// "pmtiles://" sources read ranges of one local .pmtiles file (the Protomaps test map).
addProtocol("pmtiles", new Protocol().tile);

export { maplibreGL };
