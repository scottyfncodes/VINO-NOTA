"use client";

import type { ObservationStatus, StructuralDimension } from "@/lib/domain/sensory";
import { OBSERVATION_STATUS_LABEL } from "@/lib/domain/sensory";
import s from "./inputs.module.css";

/** null = not assessed (nothing recorded). */
export type ScaleValue = { status: "assessed"; value: number } | { status: Exclude<ObservationStatus, "assessed"> } | null;

export function ScaleInput({
  dimension,
  value,
  onChange,
  showNotApplicable,
}: {
  dimension: StructuralDimension;
  value: ScaleValue;
  onChange: (v: ScaleValue) => void;
  showNotApplicable?: boolean;
}) {
  const name = `scale-${dimension.key}`;
  const assessed = value?.status === "assessed" ? value.value : null;
  const reading =
    value === null
      ? "Not assessed"
      : value.status === "assessed"
        ? dimension.scale[value.value - 1]
        : OBSERVATION_STATUS_LABEL[value.status];
  const statuses: Exclude<ObservationStatus, "assessed">[] = ["unknown"];
  if (dimension.allowAbsent) statuses.push("absent");
  if (showNotApplicable) statuses.push("not_applicable");

  return (
    <fieldset className={s.scale}>
      <legend className={s.scaleHead}>
        <span className={s.scaleName}>{dimension.label}</span>{" "}
        <span className={`${s.scaleReading} ${value ? s.scaleReadingSet : ""}`}>{reading}</span>
      </legend>
      <div className={s.dots}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={`${s.dot} ${assessed !== null && n <= assessed ? s.filled : ""}`}>
            <input
              type="radio"
              name={name}
              value={n}
              checked={assessed === n}
              onChange={() => onChange({ status: "assessed", value: n })}
              aria-label={`${dimension.label}: ${dimension.scale[n - 1]}`}
            />
            <span aria-hidden="true">{n}</span>
          </label>
        ))}
      </div>
      <div className={s.scaleEnds} aria-hidden="true">
        <span>{dimension.scale[0]}</span>
        <span>{dimension.scale[4]}</span>
      </div>
      <div className={s.statusRow}>
        {statuses.map((st) => (
          <button
            key={st}
            type="button"
            className={s.statusButton}
            aria-pressed={value?.status === st}
            onClick={() => onChange(value?.status === st ? null : { status: st })}
          >
            {OBSERVATION_STATUS_LABEL[st]}
          </button>
        ))}
        {value !== null && (
          <button type="button" className={s.statusButton} onClick={() => onChange(null)}>
            Clear
          </button>
        )}
      </div>
    </fieldset>
  );
}
