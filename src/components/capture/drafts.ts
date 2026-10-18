import type { ScaleValue } from "@/components/ui/ScaleInput";
import { STRUCTURAL_DIMENSIONS, type CategoricalKey } from "@/lib/domain/sensory";
import type { TastingInputRaw, WineInputRaw } from "@/lib/domain/validation";
import { countryCodeFromName } from "@/lib/domain/countries";
import { isWineType } from "@/lib/domain/wine";
import type { RecognitionCandidate } from "@/server/recognition/types";

/* ------------------------------- Identity ------------------------------- */

export type IdentityField = "name" | "producer" | "vintage" | "wineType" | "country" | "region" | "subregion" | "appellation" | "alcoholPct" | "grapes";

export type ProviderMark = { provider: string; confidence: number };

export type IdentityDraft = {
  name: string;
  producer: string;
  vintage: string;
  isNonVintage: boolean;
  wineType: string;
  country: string;
  region: string;
  subregion: string;
  appellation: string;
  alcoholPct: string;
  grapes: { name: string; percentage: string }[];
  /** Fields currently holding a provider-suggested value the user hasn't changed. */
  fromProvider: Partial<Record<IdentityField, ProviderMark>>;
};

export const emptyIdentity = (): IdentityDraft => ({
  name: "",
  producer: "",
  vintage: "",
  isNonVintage: false,
  wineType: "",
  country: "",
  region: "",
  subregion: "",
  appellation: "",
  alcoholPct: "",
  grapes: [],
  fromProvider: {},
});

export function identityFromWine(w: WineInputRaw): IdentityDraft {
  return {
    name: w.name ?? "",
    producer: w.producer ?? "",
    vintage: w.vintage ? String(w.vintage) : "",
    isNonVintage: Boolean(w.isNonVintage),
    wineType: w.wineType ?? "",
    country: w.country ?? "",
    region: w.region ?? "",
    subregion: w.subregion ?? "",
    appellation: w.appellation ?? "",
    alcoholPct: w.alcoholPct === null || w.alcoholPct === undefined ? "" : String(w.alcoholPct),
    grapes: (w.grapes ?? []).map((g) => ({ name: g.name, percentage: g.percentage === null || g.percentage === undefined ? "" : String(g.percentage) })),
    fromProvider: {},
  };
}

/** Confidence at or above which a provider value is pre-filled (still subject to confirmation). */
export const PREFILL_CONFIDENCE = 0.6;

export type Suggestion = { field: IdentityField; display: string; confidence: number; apply: (d: IdentityDraft) => IdentityDraft };

/**
 * Merges a recognition candidate into the draft. Only fields the user has not
 * typed into are touched. Confident values are pre-filled and marked; uncertain
 * ones are returned as suggestions the user can accept explicitly.
 */
export function applyCandidate(draft: IdentityDraft, c: RecognitionCandidate, provider: string): { draft: IdentityDraft; suggestions: Suggestion[] } {
  const next: IdentityDraft = { ...draft, fromProvider: { ...draft.fromProvider } };
  const suggestions: Suggestion[] = [];
  const userOwns = (field: IdentityField, current: string | boolean | unknown[]) => {
    const has = Array.isArray(current) ? current.length > 0 : typeof current === "boolean" ? false : String(current).trim() !== "";
    return has && !draft.fromProvider[field];
  };

  const consider = (field: IdentityField, value: string | null, confidence: number, setter: (d: IdentityDraft, v: string) => IdentityDraft, current: string | unknown[]) => {
    if (value === null || value === "") return;
    if (userOwns(field, current)) return;
    if (confidence >= PREFILL_CONFIDENCE) {
      Object.assign(next, setter(next, value));
      next.fromProvider[field] = { provider, confidence };
    } else {
      suggestions.push({
        field,
        display: value,
        confidence,
        apply: (d) => ({ ...setter(d, value), fromProvider: { ...d.fromProvider, [field]: { provider, confidence } } }),
      });
    }
  };

  consider("name", c.name.value, c.name.confidence, (d, v) => ({ ...d, name: v }), draft.name);
  consider("producer", c.producer.value, c.producer.confidence, (d, v) => ({ ...d, producer: v }), draft.producer);
  if (c.isNonVintage.value === true && c.isNonVintage.confidence >= PREFILL_CONFIDENCE && !userOwns("vintage", draft.vintage)) {
    next.isNonVintage = true;
    next.vintage = "";
    next.fromProvider.vintage = { provider, confidence: c.isNonVintage.confidence };
  } else {
    consider("vintage", c.vintage.value === null ? null : String(c.vintage.value), c.vintage.confidence, (d, v) => ({ ...d, vintage: v, isNonVintage: false }), draft.vintage);
  }
  if (c.wineType.value && isWineType(c.wineType.value)) {
    consider("wineType", c.wineType.value, c.wineType.confidence, (d, v) => ({ ...d, wineType: v }), draft.wineType);
  }
  const code = countryCodeFromName(c.country.value);
  consider("country", code, c.country.confidence, (d, v) => ({ ...d, country: v }), draft.country);
  consider("region", c.region.value, c.region.confidence, (d, v) => ({ ...d, region: v }), draft.region);
  consider("subregion", c.subregion.value, c.subregion.confidence, (d, v) => ({ ...d, subregion: v }), draft.subregion);
  consider("appellation", c.appellation.value, c.appellation.confidence, (d, v) => ({ ...d, appellation: v }), draft.appellation);
  consider("alcoholPct", c.alcoholPct.value === null ? null : String(c.alcoholPct.value), c.alcoholPct.confidence, (d, v) => ({ ...d, alcoholPct: v }), draft.alcoholPct);
  if (c.grapes.value?.length) {
    consider(
      "grapes",
      c.grapes.value.join(", "),
      c.grapes.confidence,
      (d) => ({ ...d, grapes: c.grapes.value!.map((g) => ({ name: g, percentage: "" })) }),
      draft.grapes,
    );
  }
  return { draft: next, suggestions };
}

export function identityToPayload(d: IdentityDraft, confirmedAt?: string): WineInputRaw {
  const provenance: NonNullable<WineInputRaw["provenance"]> = {};
  for (const [field, mark] of Object.entries(d.fromProvider)) {
    if (!mark) continue;
    provenance[field as IdentityField] = { source: "provider", provider: mark.provider, confidence: mark.confidence, confirmedAt };
  }
  return {
    name: d.name,
    producer: d.producer || null,
    vintage: d.isNonVintage ? null : d.vintage.trim() || null,
    isNonVintage: d.isNonVintage,
    wineType: d.wineType,
    country: d.country || null,
    region: d.region || null,
    subregion: d.region ? d.subregion || null : null,
    appellation: d.appellation || null,
    alcoholPct: d.alcoholPct.trim() || null,
    grapes: d.grapes.filter((g) => g.name.trim()).map((g) => ({ name: g.name, percentage: g.percentage.trim() || null })),
    provenance,
  };
}

/* -------------------------------- Tasting ------------------------------- */

export type TastingDraft = {
  tastedOn: string;
  score: number | null;
  scales: Record<string, ScaleValue>;
  categorical: Partial<Record<CategoricalKey, string>>;
  aromas: string[];
  flavors: string[];
  impression: string;
  notes: string;
  price: string;
  currency: string;
  priceBasis: string;
  wouldBuyAgain: boolean | null;
  venue: string;
  occasion: string;
  foodPairing: string;
  tags: string;
  blindStatus: "not_blind" | "blind_unrevealed" | "blind_revealed";
  blindGuess: string;
  servingTempC: string;
  decantMinutes: string;
  bottleProvenance: string;
  storageNotes: string;
};

export const emptyTasting = (today: string, currency: string): TastingDraft => ({
  tastedOn: today,
  score: null,
  scales: {},
  categorical: {},
  aromas: [],
  flavors: [],
  impression: "",
  notes: "",
  price: "",
  currency,
  priceBasis: "retail_bottle",
  wouldBuyAgain: null,
  venue: "",
  occasion: "",
  foodPairing: "",
  tags: "",
  blindStatus: "not_blind",
  blindGuess: "",
  servingTempC: "",
  decantMinutes: "",
  bottleProvenance: "",
  storageNotes: "",
});

export function tastingFromInput(t: TastingInputRaw, fallbackCurrency: string): TastingDraft {
  const scales: Record<string, ScaleValue> = {};
  const categorical: TastingDraft["categorical"] = {};
  const aromas: string[] = [];
  const flavors: string[] = [];
  for (const o of t.observations ?? []) {
    if (o.dimension === "aroma" && o.descriptor) aromas.push(o.descriptor);
    else if (o.dimension === "flavor" && o.descriptor) flavors.push(o.descriptor);
    else if (STRUCTURAL_DIMENSIONS.some((d) => d.key === o.dimension)) {
      scales[o.dimension] = o.status === "assessed" ? { status: "assessed", value: o.value ?? 3 } : { status: o.status };
    } else if (o.descriptor) {
      categorical[o.dimension as CategoricalKey] = o.descriptor;
    }
  }
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return {
    tastedOn: t.tastedOn,
    score: t.personalScore === null || t.personalScore === undefined || t.personalScore === "" ? null : Number(t.personalScore),
    scales,
    categorical,
    aromas,
    flavors,
    impression: str(t.impression),
    notes: str(t.notes),
    price: str(t.purchasePrice),
    currency: t.currency || fallbackCurrency,
    priceBasis: t.priceBasis || "retail_bottle",
    wouldBuyAgain: t.wouldBuyAgain ?? null,
    venue: str(t.venue),
    occasion: str(t.occasion),
    foodPairing: str(t.foodPairing),
    tags: (t.tags ?? []).join(", "),
    blindStatus: t.blindStatus ?? "not_blind",
    blindGuess: str(t.blindGuess),
    servingTempC: str(t.servingTempC),
    decantMinutes: str(t.decantMinutes),
    bottleProvenance: str(t.bottleProvenance),
    storageNotes: str(t.storageNotes),
  };
}

export function tastingToPayload(d: TastingDraft): TastingInputRaw {
  const observations: NonNullable<TastingInputRaw["observations"]> = [];
  for (const [dimension, v] of Object.entries(d.scales)) {
    if (!v) continue;
    observations.push(v.status === "assessed" ? { dimension, status: "assessed", value: v.value } : { dimension, status: v.status });
  }
  for (const [dimension, descriptor] of Object.entries(d.categorical)) {
    if (descriptor) observations.push({ dimension, status: "assessed", descriptor });
  }
  for (const a of d.aromas) observations.push({ dimension: "aroma", status: "assessed", descriptor: a });
  for (const f of d.flavors) observations.push({ dimension: "flavor", status: "assessed", descriptor: f });
  const hasPrice = d.price.trim() !== "";
  return {
    tastedOn: d.tastedOn,
    personalScore: d.score,
    purchasePrice: hasPrice ? d.price.trim() : null,
    currency: hasPrice ? d.currency : null,
    priceBasis: hasPrice ? (d.priceBasis as TastingInputRaw["priceBasis"]) : null,
    venue: d.venue,
    occasion: d.occasion,
    foodPairing: d.foodPairing,
    wouldBuyAgain: d.wouldBuyAgain,
    blindStatus: d.blindStatus,
    blindGuess: d.blindStatus === "not_blind" ? null : d.blindGuess,
    impression: d.impression,
    notes: d.notes,
    servingTempC: d.servingTempC.trim() || null,
    decantMinutes: d.decantMinutes.trim() || null,
    bottleProvenance: d.bottleProvenance,
    storageNotes: d.storageNotes,
    observations,
    tags: d.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

/** Starting point for "taste again": keeps the context, never the verdict. */
export function repeatTasting(source: TastingDraft, today: string): TastingDraft {
  return {
    ...emptyTasting(today, source.currency),
    price: source.price,
    currency: source.currency,
    priceBasis: source.priceBasis,
    venue: source.venue,
    bottleProvenance: source.bottleProvenance,
  };
}

/* -------------------------------- Autosave ------------------------------ */

export const DRAFT_KEY = "vino-nota:capture-draft:v1";

export function readDraft<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeDraft(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode); autosave is best-effort.
  }
}

export function clearDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
