import type { LatLon } from "../core/geo";
import { t } from "../i18n";

export const formatKm = (m: number) => `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;

export function formatDuration(s: number) {
  const min = Math.round(s / 60);
  const h = Math.floor(min / 60);
  return t.duration(h, min % 60);
}

const dateTime = new Intl.DateTimeFormat(t.locale, { day: "numeric", month: "short", weekday: "short", hour: "2-digit", minute: "2-digit" });
const clock = new Intl.DateTimeFormat(t.locale, { hour: "2-digit", minute: "2-digit" });

export const formatTime = (ms: number) => dateTime.format(ms);
export const formatClock = (ms: number) => clock.format(ms);

const day = new Intl.DateTimeFormat(t.locale, { day: "numeric", month: "short", weekday: "short" });
export const formatDay = (ms: number) => day.format(ms);

export const formatCoord = (p: LatLon) => `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
