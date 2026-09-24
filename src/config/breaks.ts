export const BREAK_PRESETS_MIN = [5, 10, 15, 30, 60];
export const DEFAULT_BREAK_MIN = 15;
export const BREAK_LIMITS_MIN = { min: 1, max: 600 };

// Suggested values for the automatic break form.
export const AUTO_BREAK_DEFAULT = { every: 120, unit: "min" as const, durationMin: 15 };

// Overnight stop ("Konaklama"): ride on at this local time, at least minStayH after arriving.
export const OVERNIGHT = { defaultResumeMin: 8 * 60, minStayH: 4 };
