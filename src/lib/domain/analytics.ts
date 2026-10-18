/**
 * Deterministic analytics over persisted tasting records.
 *
 * Calculation rules (also shown to users in the Compendium):
 *  - Only tastings with a recorded personal score count toward score statistics.
 *    Unrated tastings are counted separately, never treated as zero.
 *  - Score bins are [0,1), [1,2) … [8,9), [9,10]; the top bin includes 10.0.
 *  - Sensory statistics use only observations the user recorded with status
 *    "assessed". Unknown / absent / not-applicable are reported as counts.
 *  - Prices are compared only within a single currency and never converted.
 *  - Medians of an even-sized sample average the two middle values.
 */

import { STRUCTURAL_DIMENSIONS } from "./sensory";

export type AnalyticsObservation = {
  dimension: string;
  status: "assessed" | "unknown" | "absent" | "not_applicable";
  value: number | null;
  descriptor: string | null;
};

export type AnalyticsTasting = {
  id: string;
  wineId: string;
  wineName: string;
  producer: string | null;
  vintage: number | null;
  wineType: string;
  country: string | null;
  region: string | null;
  tastedOn: string; // YYYY-MM-DD
  score: number | null;
  price: number | null;
  currency: string | null;
  priceBasis: string | null;
  observations: AnalyticsObservation[];
};

export type AnalyticsFilters = {
  wineType?: string | null;
  country?: string | null;
  from?: string | null;
  to?: string | null;
};

export function applyFilters(rows: AnalyticsTasting[], f: AnalyticsFilters): AnalyticsTasting[] {
  return rows.filter(
    (r) =>
      (!f.wineType || r.wineType === f.wineType) &&
      (!f.country || r.country === f.country) &&
      (!f.from || r.tastedOn >= f.from) &&
      (!f.to || r.tastedOn <= f.to),
  );
}

export function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Sample-size qualifier used across the product to avoid overstating certainty. */
export function sampleStrength(n: number): "none" | "anecdotal" | "emerging" | "established" {
  if (n === 0) return "none";
  if (n < 5) return "anecdotal";
  if (n < 15) return "emerging";
  return "established";
}

/* ----------------------------- Rating distribution ----------------------------- */

export type ScoreBin = { start: number; end: number; label: string; count: number; tastingIds: string[] };

export type RatingDistribution = {
  bins: ScoreBin[];
  rated: number;
  unrated: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
};

export function binIndex(score: number): number {
  return Math.min(9, Math.floor(score));
}

export function ratingDistribution(rows: AnalyticsTasting[]): RatingDistribution {
  const bins: ScoreBin[] = Array.from({ length: 10 }, (_, i) => ({
    start: i,
    end: i + 1,
    label: i === 9 ? "9–10" : `${i}–${i + 1}`,
    count: 0,
    tastingIds: [],
  }));
  const scores: number[] = [];
  let unrated = 0;
  for (const r of rows) {
    if (r.score === null) {
      unrated++;
      continue;
    }
    scores.push(r.score);
    const b = bins[binIndex(r.score)];
    b.count++;
    b.tastingIds.push(r.id);
  }
  return {
    bins,
    rated: scores.length,
    unrated,
    mean: mean(scores),
    median: median(scores),
    min: scores.length ? Math.min(...scores) : null,
    max: scores.length ? Math.max(...scores) : null,
  };
}

/* ------------------------------ Palate fingerprint ----------------------------- */

export type FingerprintLevel = {
  value: number;
  count: number;
  /** Tastings at this level that also carry a score. */
  ratedCount: number;
  meanScore: number | null;
  tastingIds: string[];
};

export type FingerprintDimension = {
  key: string;
  label: string;
  scale: string[];
  assessed: number;
  unknown: number;
  absent: number;
  notApplicable: number;
  notAssessed: number;
  meanValue: number | null;
  levels: FingerprintLevel[];
};

export type DescriptorStat = {
  descriptor: string;
  count: number;
  ratedCount: number;
  meanScore: number | null;
  tastingIds: string[];
};

export type PalateFingerprint = {
  tastings: number;
  dimensions: FingerprintDimension[];
  descriptors: DescriptorStat[];
};

export function palateFingerprint(rows: AnalyticsTasting[], descriptorLimit = 12): PalateFingerprint {
  const dimensions = STRUCTURAL_DIMENSIONS.map((dim): FingerprintDimension => {
    const levels: FingerprintLevel[] = [1, 2, 3, 4, 5].map((value) => ({ value, count: 0, ratedCount: 0, meanScore: null, tastingIds: [] }));
    const levelScores: number[][] = [[], [], [], [], []];
    const values: number[] = [];
    let unknown = 0;
    let absent = 0;
    let notApplicable = 0;
    for (const r of rows) {
      const o = r.observations.find((x) => x.dimension === dim.key);
      if (!o) continue;
      if (o.status === "unknown") unknown++;
      else if (o.status === "absent") absent++;
      else if (o.status === "not_applicable") notApplicable++;
      else if (o.value !== null) {
        const lvl = levels[o.value - 1];
        lvl.count++;
        lvl.tastingIds.push(r.id);
        values.push(o.value);
        if (r.score !== null) {
          lvl.ratedCount++;
          levelScores[o.value - 1].push(r.score);
        }
      }
    }
    levels.forEach((l, i) => (l.meanScore = mean(levelScores[i])));
    return {
      key: dim.key,
      label: dim.label,
      scale: dim.scale,
      assessed: values.length,
      unknown,
      absent,
      notApplicable,
      notAssessed: rows.length - values.length - unknown - absent - notApplicable,
      meanValue: mean(values),
      levels,
    };
  });

  const descriptorMap = new Map<string, { label: string; ids: Set<string>; scores: number[] }>();
  for (const r of rows) {
    const seen = new Set<string>();
    for (const o of r.observations) {
      if ((o.dimension !== "aroma" && o.dimension !== "flavor") || o.status !== "assessed" || !o.descriptor) continue;
      const key = o.descriptor.trim().toLowerCase();
      if (seen.has(key)) continue; // count each descriptor once per tasting
      seen.add(key);
      const entry = descriptorMap.get(key) ?? { label: o.descriptor.trim(), ids: new Set<string>(), scores: [] };
      entry.ids.add(r.id);
      if (r.score !== null) entry.scores.push(r.score);
      descriptorMap.set(key, entry);
    }
  }
  const descriptors = [...descriptorMap.values()]
    .map((e) => ({ descriptor: e.label, count: e.ids.size, ratedCount: e.scores.length, meanScore: mean(e.scores), tastingIds: [...e.ids] }))
    .sort((a, b) => b.count - a.count || a.descriptor.localeCompare(b.descriptor))
    .slice(0, descriptorLimit);

  return { tastings: rows.length, dimensions, descriptors };
}

/* ------------------------------- Value landscape ------------------------------- */

export type ValuePoint = {
  id: string;
  wineId: string;
  label: string;
  price: number;
  score: number;
  basis: string | null;
  tastedOn: string;
};

export type ValueLandscape = {
  currencies: { currency: string; count: number }[];
  currency: string | null;
  points: ValuePoint[];
  excluded: { noPrice: number; noScore: number; otherCurrency: number };
  medianPrice: number | null;
  medianScore: number | null;
  /** Rated at or above 8.0 and priced at or below the median for the currency. */
  discoveries: ValuePoint[];
};

export function valueLandscape(rows: AnalyticsTasting[], preferredCurrency?: string | null, basis?: string | null): ValueLandscape {
  const priced = rows.filter((r) => r.price !== null && r.currency && r.score !== null && (!basis || r.priceBasis === basis));
  const counts = new Map<string, number>();
  for (const r of priced) counts.set(r.currency!, (counts.get(r.currency!) ?? 0) + 1);
  const currencies = [...counts.entries()]
    .map(([currency, count]) => ({ currency, count }))
    .sort((a, b) => b.count - a.count || a.currency.localeCompare(b.currency));
  const currency = preferredCurrency && counts.has(preferredCurrency) ? preferredCurrency : (currencies[0]?.currency ?? null);

  const points: ValuePoint[] = priced
    .filter((r) => r.currency === currency)
    .map((r) => ({
      id: r.id,
      wineId: r.wineId,
      label: [r.producer, r.wineName, r.vintage].filter(Boolean).join(" "),
      price: r.price!,
      score: r.score!,
      basis: r.priceBasis,
      tastedOn: r.tastedOn,
    }));

  const medianPrice = median(points.map((p) => p.price));
  const medianScore = median(points.map((p) => p.score));
  const discoveries =
    points.length >= 3 && medianPrice !== null
      ? points.filter((p) => p.score >= 8 && p.price <= medianPrice).sort((a, b) => b.score - a.score || a.price - b.price)
      : [];

  return {
    currencies,
    currency,
    points,
    excluded: {
      noPrice: rows.filter((r) => r.price === null || !r.currency).length,
      noScore: rows.filter((r) => r.price !== null && r.currency && r.score === null).length,
      otherCurrency: priced.length - points.length,
    },
    medianPrice,
    medianScore,
    discoveries,
  };
}

/* ------------------------------ Tasting chronology ----------------------------- */

export type ChronologyMonth = { month: string; count: number; rated: number; meanScore: number | null };

export type Chronology = {
  points: { id: string; wineId: string; tastedOn: string; score: number | null; label: string }[];
  months: ChronologyMonth[];
  first: string | null;
  last: string | null;
};

/** Monthly series including empty months between the first and last tasting. */
export function chronology(rows: AnalyticsTasting[]): Chronology {
  const sorted = [...rows].sort((a, b) => a.tastedOn.localeCompare(b.tastedOn) || a.id.localeCompare(b.id));
  const points = sorted.map((r) => ({
    id: r.id,
    wineId: r.wineId,
    tastedOn: r.tastedOn,
    score: r.score,
    label: [r.producer, r.wineName, r.vintage].filter(Boolean).join(" "),
  }));
  if (!sorted.length) return { points, months: [], first: null, last: null };

  const byMonth = new Map<string, number[]>();
  const countByMonth = new Map<string, number>();
  for (const r of sorted) {
    const m = r.tastedOn.slice(0, 7);
    countByMonth.set(m, (countByMonth.get(m) ?? 0) + 1);
    if (r.score !== null) byMonth.set(m, [...(byMonth.get(m) ?? []), r.score]);
  }
  const months: ChronologyMonth[] = [];
  const first = sorted[0].tastedOn.slice(0, 7);
  const last = sorted[sorted.length - 1].tastedOn.slice(0, 7);
  let [y, mo] = first.split("-").map(Number);
  // Guard against unbounded loops with a generous cap (100 years).
  for (let i = 0; i < 1200; i++) {
    const key = `${y}-${String(mo).padStart(2, "0")}`;
    const scores = byMonth.get(key) ?? [];
    months.push({ month: key, count: countByMonth.get(key) ?? 0, rated: scores.length, meanScore: mean(scores) });
    if (key === last) break;
    mo++;
    if (mo > 12) {
      mo = 1;
      y++;
    }
  }
  return { points, months, first: sorted[0].tastedOn, last: sorted[sorted.length - 1].tastedOn };
}

/* ------------------------------- Personal insight ------------------------------ */

export type InsightGroup = { key: string; label: string; n: number; mean: number };

export type PersonalInsight = {
  kind: "wineType" | "country";
  statement: string;
  groups: InsightGroup[];
  totalRated: number;
};

const MIN_GROUP = 3;
const MIN_TOTAL = 8;
const MIN_GAP = 0.5;

/**
 * A single evidence-backed comparison, or null when the data cannot support one.
 * Requires at least two groups with ≥3 rated tastings each, ≥8 rated overall,
 * and a gap of at least 0.5 points between the highest and lowest group means.
 */
export function personalInsight(
  rows: AnalyticsTasting[],
  labels: { wineType: (v: string) => string; country: (v: string) => string },
): PersonalInsight | null {
  const rated = rows.filter((r) => r.score !== null);
  if (rated.length < MIN_TOTAL) return null;

  const candidates: PersonalInsight[] = [];
  for (const kind of ["wineType", "country"] as const) {
    const groups = new Map<string, number[]>();
    for (const r of rated) {
      const key = kind === "wineType" ? r.wineType : r.country;
      if (!key) continue;
      groups.set(key, [...(groups.get(key) ?? []), r.score!]);
    }
    const eligible: InsightGroup[] = [...groups.entries()]
      .filter(([, s]) => s.length >= MIN_GROUP)
      .map(([key, s]) => ({ key, label: kind === "wineType" ? labels.wineType(key) : labels.country(key), n: s.length, mean: mean(s)! }))
      .sort((a, b) => b.mean - a.mean || b.n - a.n);
    if (eligible.length < 2) continue;
    const top = eligible[0];
    const bottom = eligible[eligible.length - 1];
    const gap = top.mean - bottom.mean;
    if (gap < MIN_GAP) continue;
    const noun = kind === "wineType" ? "wines" : "wines from";
    const statement =
      kind === "wineType"
        ? `You have rated ${top.label.toLowerCase()} ${noun} ${gap.toFixed(1)} points higher on average than ${bottom.label.toLowerCase()} ${noun}.`
        : `You have rated ${noun} ${top.label} ${gap.toFixed(1)} points higher on average than ${noun} ${bottom.label}.`;
    candidates.push({ kind, statement, groups: eligible, totalRated: rated.length });
  }
  if (!candidates.length) return null;
  // Prefer the comparison backed by the most rated tastings in its compared groups.
  candidates.sort((a, b) => {
    const na = a.groups[0].n + a.groups[a.groups.length - 1].n;
    const nb = b.groups[0].n + b.groups[b.groups.length - 1].n;
    return nb - na;
  });
  return candidates[0];
}
