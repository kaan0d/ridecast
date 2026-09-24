// Small authored icon set: 24px grid, 1.75 stroke, round caps, currentColor.

const svg = (body: string, cls = "icon") =>
  `<svg class="${cls}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const cloudPath = '<path d="M7 18h10.5a3.5 3.5 0 0 0 .4-6.98A5.5 5.5 0 0 0 7.3 10.1 4 4 0 0 0 7 18Z"/>';
const smallCloud = '<path d="M8 15h8.5a3 3 0 0 0 .3-5.98A4.8 4.8 0 0 0 7.6 8.3 3.4 3.4 0 0 0 8 15Z"/>';

export const icons = {
  locate: svg('<path d="M20 4 4 10.5l7 2.5 2.5 7L20 4Z"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  pause: svg('<path d="M9 6v12M15 6v12"/>'),

  // Weather
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>'),
  partly: svg('<path d="M9 3.5v1.2M3.8 5.8l.9.9M2.5 11h1.2M14.3 5.8l-.9.9"/><path d="M5.6 12.4A3.8 3.8 0 1 1 12.2 8"/><path d="M9 20h8.5a3.2 3.2 0 0 0 .4-6.38 5 5 0 0 0-9.4-.85A3.6 3.6 0 0 0 9 20Z"/>'),
  cloud: svg(cloudPath),
  moon: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>'),
  partlyNight: svg('<path d="M12.5 7.8A4.6 4.6 0 0 1 7 3.2a4.6 4.6 0 0 0-1.9 8.3"/><path d="M9 20h8.5a3.2 3.2 0 0 0 .4-6.38 5 5 0 0 0-9.4-.85A3.6 3.6 0 0 0 9 20Z"/>'),
  fog: svg('<path d="M4 9h16M3 13h18M5 17h14M8 21h8"/>'),
  drizzle: svg(`${smallCloud}<path d="M9 18.5v.5M13 18.5v.5M11 21v.5M15 21v.5"/>`),
  rain: svg(`${smallCloud}<path d="M9 17.5 8 21M13 17.5 12 21M17 17.5 16 21"/>`),
  snow: svg(`${smallCloud}<path d="M9 18.5h.01M13 18.5h.01M11 21h.01M15 21h.01M17 18.5h.01"/>`),
  storm: svg(`${smallCloud}<path d="m12.5 15.5-2 3.5h3l-2 3.5"/>`),
  wind: svg('<path d="M3 8h11a2.5 2.5 0 1 0-2.5-2.5M3 12h15a3 3 0 1 1-3 3M3 16h7"/>'),
  fuel: svg('<path d="M5 20V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14M4 20h12M5 11h10"/><path d="M15 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V9l-3-3"/>'),
  rest: svg('<path d="M4 18h16M6 18v-5h12v5M8 13V9a4 4 0 0 1 8 0v4"/>'),
  swap: svg('<path d="M8 20V4M4 8l4-4 4 4M16 4v16M12 16l4 4 4-4"/>'),
  arrowUp: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
};

export type WeatherIcon = "sun" | "moon" | "partly" | "partlyNight" | "cloud" | "fog" | "drizzle" | "rain" | "snow" | "storm";
