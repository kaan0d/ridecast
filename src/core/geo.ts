// All coordinate order conversions live here.
// OSRM/GeoJSON use [lon, lat], Leaflet uses [lat, lon]; the app uses LatLon objects.

export interface LatLon {
  lat: number;
  lon: number;
}

export const fromLonLat = ([lon, lat]: number[]): LatLon => ({ lat, lon });

export const toLonLatString = (p: LatLon): string => `${p.lon},${p.lat}`;

export const toLatLng = (p: LatLon): [number, number] => [p.lat, p.lon];

export const fromLatLng = (p: { lat: number; lng: number }): LatLon => ({ lat: p.lat, lon: p.lng });
