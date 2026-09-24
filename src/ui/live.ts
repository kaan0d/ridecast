import { t } from "../i18n";
import { LIVE } from "../config/live";
import type { Timeline } from "../core/eta/eta";
import { etaAtDistance } from "../core/eta/eta";
import type { LatLon } from "../core/geo";
import { liveTimeline, newOrWorse, nextWarning, offRouteCount, paceFactor, type Fix } from "../core/live/live";
import { haversineM, snapToLine, type Line } from "../core/route/line";
import type { Level } from "../core/risk/risk";
import { conditionOf } from "../core/weather/weather";
import { formatClock, formatDuration, formatKm } from "./format";
import { weatherIcon, type WeatherPoint } from "./weather";

// What live mode needs from the planner, read fresh on every fix.
export interface LiveRoute {
  id: object; // changes when the route is replaced
  line: Line;
  scale: number; // line metres to step metres
  totalM: number;
  timeline: Timeline; // as planned (not re-anchored)
  points: WeatherPoint[];
}

interface Deps {
  route(): LiveRoute | null;
  replan(): void; // re-render with the live timeline (new ETAs, weather from cache)
  refreshWeather(): void; // same, but asks for a fresh forecast
  reroute(from: LatLon, aheadOfM: number): void;
  showPosition(p: LatLon | null): void;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function createLive(deps: Deps) {
  const view = $("live");
  const pill = $("live-pill");
  let active = false;
  let watchId: number | null = null;
  let wakeLock: WakeLockSentinel | null = null;
  let refreshTimer: number | undefined;
  let fixes: Fix[] = [];
  let routeId: object | null = null;
  let offCount = 0;
  let known = new Map<string, Level>();
  let sound = false;
  let lastPace = 1;
  let lastReplanMs = 0;
  let notes: string[] = [];
  let alert: { text: string; level: Level } | null = null;
  let baseline = false; // the first forecast after start sets what counts as "known"
  let baselineRoute: object | null = null;
  let lastPosition: LatLon | null = null;

  // Fixes belong to one route; after a reroute the old ones mean nothing until a new fix comes.
  const current = () => (routeId === deps.route()?.id ? (fixes[fixes.length - 1] ?? null) : null);

  function setNote(key: string, text: string | null) {
    notes = notes.filter((n) => !n.startsWith(key + ":"));
    if (text) notes.push(`${key}:${text}`);
  }

  async function lockScreen() {
    if (!("wakeLock" in navigator)) return setNote("wake", t.live.noWake);
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      setNote("wake", null);
    } catch {
      setNote("wake", t.live.wakeFailed);
    }
    render();
  }

  // The lock is dropped whenever the page is hidden; take it again when it comes back.
  document.addEventListener("visibilitychange", () => {
    if (active && document.visibilityState === "visible" && !wakeLock) void lockScreen();
  });

  function onPosition(pos: GeolocationPosition) {
    const r = deps.route();
    if (!r) return;
    if (routeId !== r.id) {
      // New route (start, reroute): distances are not comparable, start over.
      routeId = r.id;
      fixes = [];
      offCount = 0;
    }
    const p = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    const s = snapToLine(r.line, p);
    const fix: Fix = { t: pos.timestamp, distM: s.distM * r.scale, offM: haversineM(p, s.pos) };
    fixes = [...fixes.filter((f) => fix.t - f.t <= LIVE.pace.windowMs), fix];
    offCount = offRouteCount(offCount, fix.offM, pos.coords.accuracy, LIVE.offRouteM);
    setNote("gps", pos.coords.accuracy > LIVE.poorAccuracyM ? t.live.gpsPoor(Math.round(pos.coords.accuracy)) : null);
    lastPosition = p;
    deps.showPosition(p);
    // Re-plan (ETAs, weather ETAs) when the pace moved enough, or once a minute.
    const pace = paceFactor(fixes, r.timeline, LIVE.pace);
    if (Math.abs(pace - lastPace) > LIVE.replanPaceDelta || fix.t - lastReplanMs > LIVE.replanEveryMs) {
      lastPace = pace;
      lastReplanMs = fix.t;
      deps.replan();
    }
    render();
  }

  function onError(err: GeolocationPositionError) {
    if (err.code === err.PERMISSION_DENIED) {
      stop();
      setNote("gps", null);
      $("status").textContent = t.live.noPermission;
      $("status").dataset.kind = "error";
      return;
    }
    setNote("gps", err.code === err.TIMEOUT ? t.live.gpsWaiting : t.live.gpsUnavailable);
    render();
  }

  // Called by the planner after each forecast: alert on warnings ahead that are new or worse.
  function onWeather(points: WeatherPoint[]) {
    if (!active) return;
    // A new route (reroute) has new distances: its first forecast is a new baseline, not news.
    const routeNow = deps.route()?.id ?? null;
    if (routeNow !== baselineRoute) {
      baselineRoute = routeNow;
      baseline = false;
      known = new Map();
    }
    const cur = current()?.distM ?? 0;
    const { changes, next } = newOrWorse(known, points, cur, LIVE.alertMinLevel);
    // Remember every warning seen on this route at its highest level, so one that flickers out
    // and back (its arrival time crossing an hour) is not news again.
    for (const [k, v] of next) known.set(k, Math.max(known.get(k) ?? 0, v) as Level);
    if (!baseline) {
      baseline = true;
      return render();
    }
    if (changes.length) {
      const worst = changes.reduce((a, b) => (b.level > a.level ? b : a));
      // An open alert is only replaced by one at least as serious.
      if (!alert || worst.level >= alert.level)
        alert = { text: t.live.ahead(worst.text, formatKm(points[worst.index].distM - cur)), level: worst.level };
      navigator.vibrate?.([200, 100, 200]);
      if (sound) beep();
    }
    render();
  }

  function beep() {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      osc.frequency.value = 880;
      osc.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      // no audio: the banner and vibration still show
    }
  }

  // Timeline for the planner while live: the rest of the trip counted from now at the real pace.
  function adjust(tl: Timeline): Timeline {
    const f = current();
    if (!active || !f) return tl;
    return liveTimeline(tl, f.distM, f.t, lastPace);
  }

  function render() {
    view.hidden = !active || view.dataset.min === "1";
    pill.hidden = !active || view.dataset.min !== "1";
    if (!active) return;
    const r = deps.route();
    const f = current();
    const tl = r ? adjust(r.timeline) : null;
    const remainingM = r && f ? Math.max(0, r.totalM - f.distM) : null;
    const arrival = tl ? tl.timeMs[tl.timeMs.length - 1] : null;
    const leftS = arrival && f ? Math.max(0, (arrival - f.t) / 1000) : null;
    const warn = r && f ? nextWarning(r.points, f.distM, LIVE.nextMinLevel) : null;
    const here = r && f ? r.points.reduce<WeatherPoint | null>((a, b) => (b.distM >= f.distM && (!a || b.distM < a.distM) ? b : a), null) : null;

    $("live-next").innerHTML = "";
    const nextText = document.createElement("strong");
    const nextMeta = document.createElement("span");
    if (!f) {
      nextText.textContent = t.live.waiting;
      nextMeta.textContent = "";
    } else if (warn) {
      nextText.textContent = warn.event.text;
      const at = tl ? etaAtDistance(tl, r!.points[warn.index].distM) : null;
      nextMeta.textContent = `${t.live.inDist(formatKm(warn.aheadM))}${at ? " · " + formatClock(at) : ""}`;
      $("live-next").dataset.level = String(warn.event.level);
    } else {
      nextText.textContent = t.live.noWarning;
      nextMeta.textContent = t.live.toArrival;
      $("live-next").dataset.level = "0";
    }
    $("live-next").append(nextText, nextMeta);

    $("live-left").textContent = leftS !== null ? formatDuration(leftS) : "–";
    $("live-meta").textContent = remainingM !== null && arrival ? t.live.meta(formatKm(remainingM), formatClock(arrival)) : "";

    const h = here?.hour;
    $("live-weather").innerHTML = h ? `${weatherIcon(h)}<b>${Math.round(h.tempC)}°</b><span></span>` : "";
    if (h) $("live-weather").querySelector("span")!.textContent = t.conditions[conditionOf(h.code).name] + (here?.risk ? t.live.feels(Math.round(here.risk.feltC)) : "");

    const off = offCount >= LIVE.offRouteFixes;
    $("live-off").hidden = !off;
    $("live-alert").hidden = !alert;
    if (alert) {
      $("live-alert-text").textContent = alert.text;
      $("live-alert").dataset.level = String(alert.level);
    }
    setNote("net", navigator.onLine ? null : t.live.offline);
    $("live-notes").textContent = notes.map((n) => n.slice(n.indexOf(":") + 1)).join(" ");
    $("live-sound").setAttribute("aria-pressed", String(sound));
    $("live-sound").textContent = sound ? t.live.soundOn : t.live.soundOff;
    pill.textContent = t.live.pill(leftS !== null ? formatDuration(leftS) : "–", warn ? t.live.pillWarn(warn.event.text, formatKm(warn.aheadM)) : "");
  }

  function start() {
    if (active) return;
    if (!("geolocation" in navigator)) {
      $("status").textContent = t.live.noGeo;
      $("status").dataset.kind = "error";
      return;
    }
    active = true;
    fixes = [];
    known = new Map();
    baseline = false;
    alert = null;
    offCount = 0;
    lastPace = 1;
    view.dataset.min = "0";
    watchId = navigator.geolocation.watchPosition(onPosition, onError, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    void lockScreen();
    refreshTimer = window.setInterval(() => deps.refreshWeather(), LIVE.weatherRefreshMs);
    render();
  }

  function stop() {
    active = false;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    clearInterval(refreshTimer);
    void wakeLock?.release().catch(() => {});
    wakeLock = null;
    notes = [];
    lastPosition = null;
    deps.showPosition(null);
    render();
    deps.replan();
  }

  $("live-end").addEventListener("click", stop);
  $("live-min").addEventListener("click", () => {
    view.dataset.min = "1";
    render();
  });
  pill.addEventListener("click", () => {
    view.dataset.min = "0";
    render();
  });
  $("live-sound").addEventListener("click", () => {
    sound = !sound;
    if (sound) beep(); // also unlocks audio, which needs a tap
    render();
  });
  $("live-refresh").addEventListener("click", () => deps.refreshWeather());
  // Sunlight mode: black on white, darker risk colours, heavier type. Remembered per browser.
  const sunKey = "ridecast.sunlight";
  const setSun = (on: boolean, remember = true) => {
    view.dataset.contrast = on ? "high" : "";
    $("live-sun").setAttribute("aria-pressed", String(on));
    if (!remember) return;
    try {
      localStorage.setItem(sunKey, on ? "1" : "0");
    } catch {
      // not remembered
    }
  };
  const prefersMore = matchMedia("(prefers-contrast: more)").matches;
  try {
    const saved = localStorage.getItem(sunKey);
    setSun(saved === null ? prefersMore : saved === "1", false);
  } catch {
    setSun(prefersMore, false);
  }
  $("live-sun").addEventListener("click", () => setSun(view.dataset.contrast !== "high"));
  $("live-alert-close").addEventListener("click", () => {
    alert = null;
    render();
  });
  $("live-reroute").addEventListener("click", () => {
    const f = current();
    if (f && lastPosition) deps.reroute(lastPosition, f.distM);
  });

  return {
    start,
    stop,
    isActive: () => active,
    adjust,
    onWeather,
    render,
  };
}
