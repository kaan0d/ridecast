// All coordinate order conversions live here.
// OSRM, GeoJSON and MapLibre use [lon, lat]; the app uses LatLon objects.

export interface LatLon {
  lat: number;
  lon: number;
}

export const fromLonLat = ([lon, lat]: number[]): LatLon => ({ lat, lon });

export const toLonLatString = (p: LatLon): string => `${p.lon},${p.lat}`;

export const toLngLat = (p: LatLon): [number, number] => [p.lon, p.lat];

export const fromLngLat = (p: { lat: number; lng: number }): LatLon => ({ lat: p.lat, lon: p.lng });
