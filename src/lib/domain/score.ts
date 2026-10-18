export const SCORE_MIN = 0;
export const SCORE_MAX = 10;

/**
 * Parses a personal enjoyment score. Returns null for an empty value (unrated),
 * a number rounded to one decimal place, or an error for anything invalid.
 */
export function parseScore(input: unknown): { ok: true; value: number | null } | { ok: false; error: string } {
  if (input === null || input === undefined || input === "") return { ok: true, value: null };
  const n = typeof input === "number" ? input : Number(String(input).trim().replace(",", "."));
  if (!Number.isFinite(n)) return { ok: false, error: "Score must be a number." };
  if (n < SCORE_MIN || n > SCORE_MAX) return { ok: false, error: "Score must be between 0.0 and 10.0." };
  const rounded = Math.round(n * 10) / 10;
  if (Math.abs(rounded - n) > 1e-9) return { ok: false, error: "Score allows one decimal place." };
  return { ok: true, value: rounded };
}

export function formatScore(score: number | string | null | undefined): string {
  if (score === null || score === undefined || score === "") return "—";
  const n = typeof score === "string" ? Number(score) : score;
  return Number.isFinite(n) ? n.toFixed(1) : "—";
}

/** Short verbal anchor shown alongside the numeric score; purely descriptive. */
export function scoreAnchor(score: number | null): string {
  if (score === null) return "Not yet rated";
  if (score >= 9.5) return "Unforgettable";
  if (score >= 8.5) return "Outstanding";
  if (score >= 7.5) return "Very good";
  if (score >= 6.5) return "Good";
  if (score >= 5) return "Fair";
  if (score >= 3) return "Disappointing";
  return "Not for me";
}
