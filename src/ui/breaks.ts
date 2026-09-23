import { AUTO_BREAK_DEFAULT, BREAK_LIMITS_MIN, BREAK_PRESETS_MIN } from "../config/breaks";
import type { AutoBreakRule } from "../core/eta/eta";
import { formatClock } from "./format";

export interface BreakRow {
  auto: boolean;
  durationMin: number;
  distM?: number; // missing when no timeline (invalid settings)
  startMs?: number;
  endMs?: number;
}

interface Handlers {
  onDuration(i: number, min: number): void;
  onRemove(i: number): void;
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
        title.textContent = `Mola ${i + 1}${b.auto ? " (oto)" : ""}`;
        const info = document.createElement("span");
        info.className = "break-info";
        info.textContent =
          b.distM === undefined || b.startMs === undefined || b.endMs === undefined
            ? "–"
            : `km ${Math.round(b.distM / 1000)} · ${formatClock(b.startMs)}–${formatClock(b.endMs)}`;

        const dur = document.createElement("input");
        dur.type = "number";
        dur.setAttribute("list", "break-presets");
        dur.min = String(BREAK_LIMITS_MIN.min);
        dur.max = String(BREAK_LIMITS_MIN.max);
        dur.required = true;
        dur.value = String(b.durationMin);
        dur.setAttribute("aria-label", `Mola ${i + 1} süresi (dk)`);
        dur.addEventListener("change", () => {
          if (validBreakMin(dur.valueAsNumber)) h.onDuration(i, dur.valueAsNumber);
        });
        const durLabel = document.createElement("label");
        durLabel.className = "break-duration";
        durLabel.append(dur, " dk");

        const rm = document.createElement("button");
        rm.type = "button";
        rm.className = "icon-btn";
        rm.textContent = "×";
        rm.setAttribute("aria-label", `Mola ${i + 1} sil`);
        rm.addEventListener("click", () => h.onRemove(i));

        li.append(title, durLabel, rm, info);
        return li;
      }),
    );
    if (!rows.length) {
      const li = document.createElement("li");
      li.className = "hint";
      li.textContent = "Mola yok.";
      list.append(li);
    }
  };
}
