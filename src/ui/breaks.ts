import { t } from "../i18n";
import { AUTO_BREAK_DEFAULT, BREAK_LIMITS_MIN, BREAK_PRESETS_MIN, OVERNIGHT } from "../config/breaks";
import { BREAK_ADVICE } from "../config/risk";
import type { AutoBreakRule, Timeline } from "../core/eta/eta";
import { breakAdvice } from "../core/risk/risk";
import type { Forecast } from "../core/weather/weather";
import { formatClock, formatTime } from "./format";
import { icons } from "./icons";

export interface BreakRow {
  auto: boolean;
  durationMin: number;
  distM?: number; // missing when no timeline (invalid settings)
  startMs?: number;
  endMs?: number;
  advice?: string; // weather during the break
  resumeMin?: number; // overnight: ride on at this local minute of the day
}

interface Handlers {
  onDuration(i: number, min: number): void;
  onRemove(i: number): void;
  onOvernight(i: number, resumeMin: number | null): void;
  onAuto(rule: AutoBreakRule, durationMin: number): void;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export const validBreakMin = (v: number) => v >= BREAK_LIMITS_MIN.min && v <= BREAK_LIMITS_MIN.max;

// Break list and automatic break form. Durations commit on `change` so typing keeps focus.
export function bindBreaks(h: Handlers) {
  const list = $("breaks");
  const autoForm = $<HTMLFormElement>("auto-breaks");
  const every = $<HTMLInputElement>("auto-every");
  const unit = $<HTMLSelectElement>("auto-unit");
  const autoDur = $<HTMLInputElement>("auto-duration");

  $("break-presets").replaceChildren(...BREAK_PRESETS_MIN.map((m) => new Option(String(m))));
  every.value = String(AUTO_BREAK_DEFAULT.every);
  unit.value = AUTO_BREAK_DEFAULT.unit;
  autoDur.value = String(AUTO_BREAK_DEFAULT.durationMin);
  autoDur.min = String(BREAK_LIMITS_MIN.min);
  autoDur.max = String(BREAK_LIMITS_MIN.max);

  autoForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!autoForm.reportValidity()) return;
    h.onAuto({ every: every.valueAsNumber, unit: unit.value as AutoBreakRule["unit"] }, autoDur.valueAsNumber);
  });

  return (rows: BreakRow[]) => {
    list.replaceChildren(
      ...rows.map((b, i) => {
        const li = document.createElement("li");
        li.className = "break-row";
        const title = document.createElement("span");
        title.className = "break-title";
        const overnight = b.resumeMin !== undefined;
        title.textContent = overnight ? t.breaks.overnightTitle(i + 1) : t.breaks.title(i + 1, b.auto);
        const info = document.createElement("span");
        info.className = "break-info";
        info.textContent =
          b.distM === undefined || b.startMs === undefined || b.endMs === undefined
            ? "–"
            : overnight
              ? t.breaks.overnightInfo(Math.round(b.distM / 1000), formatTime(b.startMs), formatTime(b.endMs))
              : t.breaks.info(Math.round(b.distM / 1000), formatClock(b.startMs), formatClock(b.endMs));

        const dur = document.createElement("input");
        dur.type = "number";
        dur.setAttribute("list", "break-presets");
        dur.min = String(BREAK_LIMITS_MIN.min);
        dur.max = String(BREAK_LIMITS_MIN.max);
        dur.required = true;
        dur.value = String(b.durationMin);
        dur.setAttribute("aria-label", t.breaks.durationAria(i + 1));
        dur.addEventListener("change", () => {
          if (validBreakMin(dur.valueAsNumber)) h.onDuration(i, dur.valueAsNumber);
        });
        const durLabel = document.createElement("label");
        durLabel.className = "break-duration";
        durLabel.append(dur, " " + t.breaks.min);
        // Overnight: the duration becomes a "ride on at" time.
        const resume = document.createElement("input");
        resume.type = "time";
        resume.value = overnight ? `${String(Math.floor(b.resumeMin! / 60)).padStart(2, "0")}:${String(b.resumeMin! % 60).padStart(2, "0")}` : "";
        resume.setAttribute("aria-label", t.breaks.resumeAria(i + 1));
        resume.addEventListener("change", () => {
          const [hh, mm] = resume.value.split(":").map(Number);
          if (Number.isFinite(hh) && Number.isFinite(mm)) h.onOvernight(i, hh * 60 + mm);
        });
        const resumeLabel = document.createElement("label");
        resumeLabel.className = "break-duration";
        resumeLabel.append(resume);
        const night = document.createElement("label");
        night.className = "break-night";
        const nightBox = document.createElement("input");
        nightBox.type = "checkbox";
        nightBox.checked = overnight;
        nightBox.addEventListener("change", () => h.onOvernight(i, nightBox.checked ? OVERNIGHT.defaultResumeMin : null));
        night.append(nightBox, " " + t.breaks.overnight);

        const rm = document.createElement("button");
        rm.type = "button";
        rm.className = "icon-btn";
        rm.innerHTML = icons.close;
        rm.setAttribute("aria-label", t.breaks.removeAria(i + 1));
        rm.addEventListener("click", () => h.onRemove(i));

        li.append(title, overnight ? resumeLabel : durLabel, rm, info, night);
        if (b.advice) {
          const adv = document.createElement("p");
          adv.className = "break-advice";
          adv.textContent = b.advice;
          li.append(adv);
        }
        return li;
      }),
    );
    if (!rows.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = t.breaks.none;
      list.append(li);
    }
  };
}

// Rain during each break, read from the forecast of the sample point nearest to it.
export function adviseBreaks(tl: Timeline, samples: { distM: number }[], forecasts: Forecast[]): (string | undefined)[] {
  return tl.breaks.map((b) => {
    let k = 0;
    samples.forEach((s, j) => {
      if (Math.abs(s.distM - b.distM) < Math.abs(samples[k].distM - b.distM)) k = j;
    });
    const a = breakAdvice(forecasts[k]?.hours ?? [], b.startMs, b.endMs, BREAK_ADVICE.rainMm, BREAK_ADVICE.maxExtendMin);
    const minutes = Math.round((b.endMs - b.startMs) / 60_000);
    if (a?.kind === "rainStarts")
      return a.atMin === 0 ? t.breaks.rainAtStart : t.breaks.rainStarts(a.atMin);
    if (a?.kind === "rainStops") return t.breaks.rainStops(a.extendMin, minutes + a.extendMin);
    return undefined;
  });
}
