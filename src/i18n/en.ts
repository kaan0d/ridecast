import type { ClothingTexts } from "../core/advice/clothing";
import type { Level, RiskTexts, RoadState } from "../core/risk/risk";
import type { ConditionName } from "../core/weather/weather";

const r = Math.round;
const pl = (n: number, one: string, many: string) => (n === 1 ? one : many);

// English UI texts (the default language). tr.ts has the same shape; TypeScript checks that.
export const en = {
  locale: "en-GB",
  decimal: ".",
  duration: (h: number, m: number) => (h ? `${h} h ${m} min` : `${m} min`),
  kmh: "km/h",
  km: (km: number) => `km ${km}`,
  level: ["None", "Low", "Medium", "High"] as [string, string, string, string],

  app: {
    title: "ridecast · Route weather",
    noAutoBreaks: "No break falls on the route with this interval.",
    needRoute: "Plan a route first.",
    pickEnds: "Choose a start and a destination for a route.",
    routing: "Finding the route…",
    offline: "You are offline; showing the last route and weather loaded.",
    breakWarning: (i: number, text: string) => `Break ${i}: ${text}`,
    start: "Start",
    end: "Destination",
    myLocation: "My location",
  },

  trip: {
    title: { start: "Start", end: "Destination", via: (i: number) => `Stop ${i}` },
    placeholder: { start: "From?", end: "To?", via: "Stop" },
    addressAria: (title: string) => `${title} address`,
    glyphAria: (title: string) => `${title}: drag or use the arrow keys to reorder`,
    remove: "Remove stop",
    removeAria: (title: string) => `Remove ${title.toLowerCase()}`,
    searching: "Searching…",
    noResults: "No results.",
  },

  place: {
    title: "Dropped pin",
    looking: "Looking up the address…",
    noAddress: "No address for this point.",
    from: "From here",
    to: "To here",
    addStop: "Add stop",
  },

  menu: {
    label: "Map menu",
    copy: "Copy",
    copied: "Coordinates copied.",
    from: "Directions from here",
    to: "Directions to here",
    addStop: "Add stop",
    addBreak: "Add a break here",
    onRoute: "on route",
    whatsHere: "What's here?",
    measure: "Measure distance",
    noGeo: "Your browser does not support location.",
    locating: "Getting your position…",
    denied: "Location permission denied.",
    failed: "Could not get your position.",
  },

  map: {
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    locate: "Show my location",
    layers: "Layers",
    dragStop: (title: string) => `${title} (drag to move)`,
    break: (i: number) => `Break ${i}`,
  },

  layers: {
    map: "Map",
    satellite: "Satellite",
    terrain: "Terrain",
    satelliteCredit: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    title: "Map type",
    radar: "Rain radar",
    radarIdle: "current rain",
    radarLoading: "loading…",
    radarAt: (time: string) => `latest image ${time}`,
    radarFailed: "Radar not available.",
  },

  measure: {
    hint: "Click the map to add points",
    count: (n: number) => `${n} ${pl(n, "point", "points")}`,
    pointTitle: "Drag: move · click: remove",
  },

  sheet: { expand: "Expand the panel", collapse: "Collapse the panel" },

  settings: {
    vehicles: { motorcycle: "Motorcycle", car: "Car", bicycle: "Bicycle", walking: "Walking" },
    pickDeparture: "Choose a departure date and time.",
    speedError: (min: number, max: number) => `Speed must be between ${min} and ${max} km/h.`,
  },

  summary: {
    arrival: "arrival",
    editStops: (from: string, to: string) => `${from} to ${to}. Edit the stops`,
    breaks: "Breaks",
    breaksValue: (n: number, total: string) => `${n} ${pl(n, "break", "breaks")} · ${total}`,
    departure: "Departure",
    day: (k: number) => `Day ${k}`,
    arrivalAt: (title: string) => `Arrival: ${title.toLowerCase()}`,
    roadType: "Road type (estimate)",
    road: { motorway: "Motorway", primary: "Main road", urban: "Town", ferry: "Ferry" },
    suggested: "Suggested route",
    alternative: (i: number) => `Alternative ${i}`,
    risk: (score: string, worst: string) => `risk ${score} · worst: ${worst}`,
    fastestToo: "Also the fastest",
    saferBy: (minutes: string, pct: number) => `${minutes} min, ${pct}% less risk`,
    safest: "Safest route",
  },

  best: {
    comparing: "Comparing the next 24 hours…",
    comparingWeek: "Comparing the next 7 days…",
    windowDay: "Next 24 h",
    windowWeek: "Next 7 days",
    noteWeek: (days: number, farDays: number) =>
      `The best departure of each of the next ${days} days, every full hour compared. Days more than ${farDays} ahead (dashed) are uncertain.`,
    needRoute: "Plan a route first to compare.",
    meta: (arrival: string, score: string) => `arrival ${arrival} · risk ${score}`,
    note: (hours: number, n: number) => `The ${n} lowest-risk departures among every full hour in the next ${hours} hours, at least 2 hours apart.`,
  },

  breaks: {
    title: (i: number, auto: boolean) => `Break ${i}${auto ? " (auto)" : ""}`,
    overnightTitle: (i: number) => `Overnight ${i}`,
    info: (km: number, from: string, to: string) => `km ${km} · ${from}–${to}`,
    overnightInfo: (km: number, arrive: string, leave: string) => `km ${km} · arrive ${arrive}, ride on ${leave}`,
    durationAria: (i: number) => `Break ${i} length (min)`,
    min: "min",
    resumeAria: (i: number) => `Overnight ${i}: time to ride on`,
    overnight: "Stay overnight",
    removeAria: (i: number) => `Remove break ${i}`,
    none: "No breaks.",
    rainAtStart: "Rain starts as the break begins.",
    rainStarts: (m: number) => `Rain starts ${m} min into the break. Cut it to ${m} min to leave before the rain.`,
    rainStops: (extend: number, total: number) => `It rains when the break ends and stops ${extend} min later. Consider ${total} min instead.`,
  },

  share: {
    badLink: "This link could not be read; no route loaded.",
    copied: "Copied",
    linkAria: "Share link",
    recent: "Recent routes",
    recentCleared: "Recent routes cleared.",
  },

  weather: {
    road: { dry: "Dry", damp: "Damp", wet: "Wet", ice: "Ice risk" } as Record<RoadState, string>,
    arrival: (clock: string) => `arrival ${clock}`,
    noForecast: "No forecast for this hour.",
    feelsLike: "Feels like",
    ridingFeel: "Felt while riding",
    precip: "Precipitation",
    snow: (cm: string) => `snow ${cm} cm`,
    wind: "Wind",
    calm: "Calm",
    gusts: (kmh: number) => `gusts ${kmh}`,
    visibility: "Visibility",
    roadEstimate: "Road (estimate)",
    source: (clock: string) => `Forecast hour ${clock} · Open-Meteo`,
    far: (days: number) => `More than ${days} days ahead: timing and amounts are uncertain, check again closer to the day.`,
    stripTitle: "Weather along the route",
    retry: "Try again",
    loading: "Getting the weather…",
    noData: "no forecast",
    warnings: "Warnings",
    noWarnings: "No warnings on this trip.",
    warnAria: (level: string, text: string, when: string, where: string) => `${level} risk: ${text}${when ? ", " + when : ""}, ${where}`,
  },

  conditions: {
    clear: "Clear",
    mostlyClear: "Mostly clear",
    partly: "Partly cloudy",
    overcast: "Overcast",
    fog: "Fog",
    drizzle: "Drizzle",
    freezingDrizzle: "Freezing drizzle",
    freezingRain: "Freezing rain",
    lightRain: "Light rain",
    rain: "Rain",
    heavyRain: "Heavy rain",
    snow: "Snow",
    storm: "Thunderstorm",
    hail: "Thunderstorm with hail",
    unknown: "Unknown",
  } as Record<ConditionName, string>,

  compass: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],

  risk: {
    storm: "Thunderstorm",
    snow: "Snowfall",
    rain: (level: Level, mm: number, prob: number | null) =>
      `${level === 3 ? "Heavy Rain" : level === 1 ? "Light Rain" : "Rain"} · ${mm.toFixed(1)} mm/h${prob === null ? "" : ` · ${prob}% likely`}`,
    rainProb: (pct: number) => `Chance of Rain · ${pct}%`,
    gust: (kmh: number) => `Wind Gusts · ${r(kmh)} km/h`,
    crosswind: (kmh: number, fromRight: boolean) => `${fromRight ? "Right" : "Left"} Crosswind · ${r(kmh)} km/h`,
    visibility: (km: number, fog: boolean) => (fog ? `Fog · visibility ${km.toFixed(1)} km` : `Low Visibility · ${km.toFixed(1)} km`),
    ice: (c: number) => `Ice Risk · ${r(c)}° and a wet road (estimate)`,
    nearFreezing: (c: number) => `Near Freezing · ${r(c)}°`,
    wetRoad: "Wet Road · estimate",
    dampRoad: "Damp Road · estimate",
    cold: (c: number) => `Cold · felt ${r(c)}° while riding`,
    heat: (c: number, strong: boolean) => `Heat Stress · feels like ${r(c)}°${strong ? " · rest in the shade and drink" : ""}`,
    dark: "Riding in the Dark",
    glare: (deg: number) => `Low Sun · ahead, ${r(deg)}° · may dazzle`,
  } satisfies RiskTexts,

  clothing: {
    title: "Clothing and gear",
    nothing: "Nothing special needed on this route.",
    note: "From a fixed rule table, for the worst conditions on the route.",
    items: {
      freezing: "Dress for freezing weather",
      cold: "Dress for cold weather",
      cool: "Dress for cool weather and wind",
      heat: "Dress light for the heat and carry water",
      rain: "Bring waterproof gear",
      lowLight: "Gear for night and low visibility",
      wind: "Dress snug for strong wind and secure the luggage",
      snowIce: "Gear for snow and ice",
      carWinter: "Get the car ready for winter",
    } as Record<string, string>,
    why: {
      feltMin: (c: number) => `lowest felt ${r(c)}°`,
      tempMax: (c: number) => `highest ${r(c)}°`,
      precip: (mm: number) => `rain ${mm.toFixed(1)} mm/h`,
      wetRoad: "wet road",
      gust: (kmh: number) => `gusts ${r(kmh)} km/h`,
      visibility: (km: number) => `visibility ${km.toFixed(1)} km`,
      dark: "riding in the dark",
      snow: "snow",
      ice: "ice risk",
    } satisfies ClothingTexts,
  },

  changes: {
    title: "Since your last look",
    new: (text: string, km: string) => `New: ${text} (${km})`,
    gone: (text: string, km: string) => `Gone: ${text} (${km})`,
    level: (text: string, from: string, to: string, km: string) => `${text}: ${from} → ${to} (${km})`,
    moved: (text: string, when: string, where: string) => `${text}: starts${when}${where}`,
    earlier: (d: string) => ` ${d} earlier`,
    later: (d: string) => ` ${d} later`,
    where: (now: string, before: string) => `, now ${now} (before ${before})`,
    at: (km: string) => ` (${km})`,
    since: (time: string) => `Compared with the forecast from ${time}. `,
    close: "Close",
  },

  live: {
    noWake: "This browser cannot keep the screen on; the screen may turn off.",
    wakeFailed: "Could not keep the screen on (battery saver or permission); the screen may turn off.",
    gpsPoor: (m: number) => `Poor GPS accuracy (±${m} m).`,
    noPermission: "Location permission not given; allow location in the browser settings for live mode.",
    gpsWaiting: "No position yet, waiting…",
    gpsUnavailable: "Position not available right now.",
    ahead: (text: string, dist: string) => `${text} · ${dist} ahead`,
    waiting: "Waiting for position…",
    inDist: (dist: string) => `in ${dist}`,
    noWarning: "No warnings ahead",
    toArrival: "All the way",
    meta: (km: string, clock: string) => `${km} · arrival ${clock}`,
    feels: (c: number) => ` · feels like ${c}°`,
    offline: "Offline: showing the last weather loaded; it refreshes when the connection is back.",
    soundOn: "Sound on",
    soundOff: "Sound off",
    fuelLow: (km: number) => `Fuel looks quite low (about ${km} km left). A good time to look for a fuel station.`,
    noGeo: "This browser has no location support; live mode could not start.",
  },

  errors: {
    noRoute: "No route found.",
    routeBusy: "The routing server is busy, try again in a moment.",
    routeDown: "Could not reach the routing server.",
    avoidNoRoute: "No route found with these options.",
    weatherTooFar: (days: number) => `The forecast only reaches ${days} days ahead.`,
    weatherBusy: "The weather service is busy, try again in a moment.",
    weatherDown: "Could not get the weather.",
    searchFailed: "Address search failed.",
  },


  // Static page texts by data-t key; English ones are written in index.html itself.
  html: {} as Record<string, string>,
};

export type Messages = typeof en;
