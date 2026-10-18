"use client";

import { useState } from "react";
import { formatScore, parseScore, scoreAnchor } from "@/lib/domain/score";
import s from "./inputs.module.css";

/**
 * Personal enjoyment score, 0.0–10.0 in tenths. Empty means "not yet rated" —
 * never zero. Offers a slider, ±0.1 steps and direct typing.
 */
export function ScoreInput({ value, onChange, id = "score" }: { value: number | null; onChange: (v: number | null) => void; id?: string }) {
  const [draft, setDraft] = useState(value === null ? "" : formatScore(value));
  const [error, setError] = useState<string | null>(null);
  // Keep the typed text in sync when the value changes from the slider or steppers.
  const [syncedValue, setSyncedValue] = useState(value);
  if (syncedValue !== value) {
    setSyncedValue(value);
    setDraft(value === null ? "" : formatScore(value));
  }

  const set = (n: number | null) => {
    setError(null);
    onChange(n === null ? null : Math.round(Math.min(10, Math.max(0, n)) * 10) / 10);
  };

  const commitDraft = () => {
    const r = parseScore(draft);
    if (r.ok) set(r.value);
    else {
      // Accept over-precise typing by rounding; reject anything else.
      const n = Number(draft.replace(",", "."));
      if (Number.isFinite(n) && n >= 0 && n <= 10) set(n);
      else setError(r.error);
    }
  };

  const pct = value === null ? 0 : (value / 10) * 100;

  return (
    <div className={`${s.score} ${value === null ? s.unrated : ""}`} role="group" aria-labelledby={`${id}-label`}>
      <div className={s.scoreHead}>
        <div>
          <p className="eyebrow" id={`${id}-label`}>
            Your enjoyment
          </p>
          <div className={s.scoreValueWrap}>
            <input
              id={id}
              className={s.scoreValue}
              inputMode="decimal"
              placeholder="–.–"
              value={draft}
              aria-label="Score out of 10"
              aria-invalid={error ? true : undefined}
              aria-describedby={`${id}-anchor`}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitDraft();
                }
              }}
            />
            <span className={s.scoreOutOf}>/ 10</span>
          </div>
        </div>
        <p className={s.scoreAnchor} id={`${id}-anchor`} aria-live="polite">
          {scoreAnchor(value)}
        </p>
      </div>
      <div className={s.sliderRow}>
        <button type="button" className={s.step} onClick={() => set((value ?? 5) - 0.1)} aria-label="Lower score by 0.1">
          −
        </button>
        <input
          type="range"
          className={s.range}
          min={0}
          max={10}
          step={0.1}
          value={value ?? 5}
          style={{ ["--pct" as string]: `${pct}%` }}
          aria-label="Score slider"
          aria-valuetext={value === null ? "Not yet rated" : `${formatScore(value)} out of 10, ${scoreAnchor(value)}`}
          onChange={(e) => set(Number(e.target.value))}
        />
        <button type="button" className={s.step} onClick={() => set((value ?? 5) + 0.1)} aria-label="Raise score by 0.1">
          +
        </button>
      </div>
      <div className={s.ticks} aria-hidden="true">
        {[0, 2, 4, 6, 8, 10].map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <div className={s.scoreFoot}>
        <span>{error ?? "Your own enjoyment, not an expert rating."}</span>
        {value !== null && (
          <button type="button" className={s.linkButton} onClick={() => set(null)}>
            Leave unrated
          </button>
        )}
      </div>
    </div>
  );
}
