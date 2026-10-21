/**
 * Reference-catalog rules: import records, barcode handling, and how catalog
 * evidence may complete a label reading. Pure and client-safe.
 *
 * The catalog completes a reading; it never overrides it. A field the label
 * already gave is left alone, vintages and alcohol are never taken from the
 * catalog (they belong to one bottling, not to the wine), and nothing is filled
 * from a weak or ambiguous match.
 */
import { normalizeProducer, normalizeText } from "./normalize";
import { isWineType } from "./wine";

/* ----------------------------------------------------------------------------
 * Barcodes
 * ------------------------------------------------------------------------- */

/** GTIN check digit (mod 10, weights 3/1 from the right, excluding the check digit). */
function gtinCheckDigitValid(digits: string) {
  let sum = 0;
  for (let i = digits.length - 2, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += Number(digits[i]) * w;
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

/**
 * Normalises a barcode to its GTIN digits, or null when it isn't a valid
 * EAN-8 / UPC-A / EAN-13 / GTIN-14. UPC-A is stored as its EAN-13 form.
 */
export function normalizeBarcode(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits) || ![8, 12, 13, 14].includes(digits.length)) return null;
  if (!gtinCheckDigitValid(digits)) return null;
  return digits.length === 12 ? `0${digits}` : digits;
}

/* ----------------------------------------------------------------------------
 * Import records
 * ------------------------------------------------------------------------- */

export type RegionKind = "region" | "subregion" | "appellation";

export type RegionRecord = { externalId: string; kind: RegionKind; name: string; country: string | null; parentExternalId: string | null; aliases: string[] };
export type ProducerRecord = { externalId: string; name: string; country: string | null; regionExternalId: string | null; aliases: string[] };
export type GrapeRecord = { externalId: string; name: string; aliases: string[] };
export type WineRecord = {
  externalId: string;
  name: string;
  producerExternalId: string | null;
  wineType: string | null;
  regionExternalId: string | null;
  country: string | null;
  grapeExternalIds: string[];
  aliases: string[];
};
export type ProductRecord = {
  externalId: string;
  barcode: string | null;
  productName: string;
  producerName: string | null;
  wineExternalId: string | null;
  vintage: number | null;
  isNonVintage: boolean;
  volumeMl: number | null;
  alcoholPct: number | null;
  country: string | null;
};

export type ImportBatch = {
  regions: RegionRecord[];
  producers: ProducerRecord[];
  grapes: GrapeRecord[];
  wines: WineRecord[];
  products: ProductRecord[];
};

export type Rejection = { kind: keyof ImportBatch; externalId: string; reason: string };

export type ValidatedBatch = { batch: ImportBatch; rejected: Rejection[]; duplicates: { kind: keyof ImportBatch; externalId: string }[] };

const COUNTRY = /^[A-Z]{2}$/;
/** Wikimedia housekeeping pages ("Category:Aylés (DO)") sometimes carry a place's class; they are never places themselves. */
const WIKIMEDIA_NAMESPACE = /^(Category|Template|Wikipedia|Portal|Help|Module|File):/i;
export const isWikimediaNamespaceName = (name: string) => WIKIMEDIA_NAMESPACE.test(name.trim());
const clean = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ");
const cleanAliases = (name: string, aliases: string[]) => {
  const own = normalizeText(name);
  const seen = new Set<string>();
  return aliases
    .map(clean)
    .filter((a) => a.length > 0 && a.length <= 200)
    .filter((a) => {
      const n = normalizeText(a);
      if (!n || n === own || seen.has(n)) return false;
      seen.add(n);
      return true;
    })
    .slice(0, 50);
};

/**
 * Validates and de-duplicates a batch from one source. Records that can't be
 * trusted are rejected with a reason rather than repaired; a second record
 * with an already-seen external id is counted as a duplicate and dropped.
 */
export function validateBatch(input: ImportBatch): ValidatedBatch {
  const rejected: Rejection[] = [];
  const duplicates: ValidatedBatch["duplicates"] = [];
  const keep = <T extends { externalId: string }>(kind: keyof ImportBatch, records: T[], check: (r: T) => string | null, fix: (r: T) => T): T[] => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const r of records) {
      const id = clean(r.externalId);
      if (!id) {
        rejected.push({ kind, externalId: "", reason: "missing external id" });
        continue;
      }
      if (seen.has(id)) {
        duplicates.push({ kind, externalId: id });
        continue;
      }
      const problem = check(r);
      if (problem) {
        rejected.push({ kind, externalId: id, reason: problem });
        continue;
      }
      seen.add(id);
      out.push(fix({ ...r, externalId: id }));
    }
    return out;
  };
  const countryProblem = (c: string | null) => (c !== null && !COUNTRY.test(c) ? `invalid country code "${c}"` : null);
  const nameProblem = (n: string) =>
    !clean(n) ? "missing name" : clean(n).length > 200 ? "name too long" : isWikimediaNamespaceName(n) ? "a Wikimedia namespace page, not a record" : null;

  const regions = keep("regions", input.regions, (r) => nameProblem(r.name) ?? countryProblem(r.country), (r) => ({ ...r, name: clean(r.name), aliases: cleanAliases(r.name, r.aliases) }));
  const producers = keep("producers", input.producers, (r) => nameProblem(r.name) ?? countryProblem(r.country), (r) => ({ ...r, name: clean(r.name), aliases: cleanAliases(r.name, r.aliases) }));
  const grapes = keep("grapes", input.grapes, (r) => nameProblem(r.name), (r) => ({ ...r, name: clean(r.name), aliases: cleanAliases(r.name, r.aliases) }));
  const wines = keep(
    "wines",
    input.wines,
    (r) => nameProblem(r.name) ?? countryProblem(r.country) ?? (r.wineType !== null && !isWineType(r.wineType) ? `unknown wine type "${r.wineType}"` : null),
    (r) => ({ ...r, name: clean(r.name), aliases: cleanAliases(r.name, r.aliases), grapeExternalIds: [...new Set(r.grapeExternalIds)] }),
  );
  const products = keep(
    "products",
    input.products,
    (r) => {
      if (nameProblem(r.productName)) return nameProblem(r.productName);
      if (r.barcode !== null && normalizeBarcode(r.barcode) === null) return `invalid barcode "${r.barcode}"`;
      if (r.vintage !== null && (r.vintage < 1800 || r.vintage > 2100)) return `implausible vintage ${r.vintage}`;
      if (r.isNonVintage && r.vintage !== null) return "both non-vintage and a vintage";
      if (r.alcoholPct !== null && !(r.alcoholPct > 0 && r.alcoholPct <= 25)) return `implausible alcohol ${r.alcoholPct}%`;
      return countryProblem(r.country);
    },
    (r) => ({ ...r, productName: clean(r.productName), producerName: clean(r.producerName) || null, barcode: normalizeBarcode(r.barcode) }),
  );
  return { batch: { regions, producers, grapes, wines, products }, rejected, duplicates };
}

/* ----------------------------------------------------------------------------
 * Matching and enrichment
 * ------------------------------------------------------------------------- */

/** A match at or above this score may fill an empty field (as a pre-filled, still-unconfirmed value). */
export const FILL_SCORE = 0.9;
/** Between this and FILL_SCORE a match is only offered as a suggestion the user taps to use. */
export const SUGGEST_SCORE = 0.6;
/** Confidence given to suggestions: below the form's pre-fill threshold (0.6), so they are never applied silently. */
export const SUGGESTION_CONFIDENCE = 0.5;

export type CatalogEvidence = {
  producer?: { name: string; country: string | null; score: number; confidence: number; source: string };
  /** The appellation or region the label named, with its place in the hierarchy. */
  place?: {
    kind: RegionKind;
    name: string;
    country: string | null;
    region: string | null;
    subregion: string | null;
    score: number;
    confidence: number;
    source: string;
    /** More than one catalog place matched equally well (e.g. same name in two countries). */
    ambiguous: boolean;
  };
  wine?: { name: string; producer: string | null; wineType: string | null; grapes: string[]; score: number; confidence: number; source: string };
};

export type FieldValue<T> = { value: T | null; confidence: number; source?: string };

/** The identity fields the catalog may complete. Vintage, non-vintage and alcohol are deliberately absent. */
export type EnrichableFields = {
  producer: FieldValue<string>;
  name: FieldValue<string>;
  wineType: FieldValue<string>;
  country: FieldValue<string>;
  region: FieldValue<string>;
  subregion: FieldValue<string>;
  appellation: FieldValue<string>;
  grapes: FieldValue<string[]>;
};

export type Enrichment<T extends EnrichableFields> = {
  fields: T;
  /** Fields the catalog completed (pre-filled or suggested). */
  filled: (keyof EnrichableFields)[];
  /** Fields where the label and the catalog agree. */
  agreed: (keyof EnrichableFields)[];
  /** Fields where they disagree; the label's value is kept. */
  conflicts: (keyof EnrichableFields)[];
};

const confidenceFor = (score: number, entityConfidence: number) =>
  score >= FILL_SCORE ? Math.round(Math.min(score, entityConfidence) * 0.95 * 100) / 100 : score >= SUGGEST_SCORE ? SUGGESTION_CONFIDENCE : 0;

/**
 * Completes empty fields of a label reading from catalog evidence. Values the
 * label gave always win; disagreements are reported, never resolved silently.
 * `countryOf` turns the reading's country text into an ISO code for comparison.
 */
export function enrichFromCatalog<T extends EnrichableFields>(reading: T, ev: CatalogEvidence, countryOf: (name: string) => string | null, countryLabel: (code: string) => string | null): Enrichment<T> {
  const fields = { ...reading };
  const filled: (keyof EnrichableFields)[] = [];
  const agreed: (keyof EnrichableFields)[] = [];
  const conflicts: (keyof EnrichableFields)[] = [];

  const offer = <K extends keyof EnrichableFields>(field: K, value: EnrichableFields[K]["value"], score: number, entityConfidence: number, source: string, same: (a: NonNullable<EnrichableFields[K]["value"]>, b: NonNullable<EnrichableFields[K]["value"]>) => boolean) => {
    if (value === null || (Array.isArray(value) && value.length === 0)) return;
    const current = fields[field].value as EnrichableFields[K]["value"];
    if (current !== null && !(Array.isArray(current) && current.length === 0)) {
      if (score >= FILL_SCORE) (same(current as never, value as never) ? agreed : conflicts).push(field);
      return;
    }
    const confidence = confidenceFor(score, entityConfidence);
    if (confidence === 0) return;
    (fields as EnrichableFields)[field] = { value, confidence, source } as EnrichableFields[K];
    filled.push(field);
  };
  const sameText = (a: string, b: string) => normalizeText(a) === normalizeText(b);

  // Country: only from an unambiguous place or an exactly matched producer, and only if they agree.
  const placeCountry = ev.place && !ev.place.ambiguous ? ev.place.country : null;
  const producerCountry = ev.producer && ev.producer.score >= FILL_SCORE ? ev.producer.country : null;
  const catalogCountry = placeCountry && producerCountry && placeCountry !== producerCountry ? null : (placeCountry ?? producerCountry);
  if (placeCountry && producerCountry && placeCountry !== producerCountry) conflicts.push("country");
  if (catalogCountry) {
    const readCountry = fields.country.value ? countryOf(fields.country.value) : null;
    if (fields.country.value) {
      // An unrecognised country name is neither agreement nor conflict.
      if (readCountry === catalogCountry) agreed.push("country");
      else if (readCountry !== null && (ev.place?.score ?? ev.producer?.score ?? 0) >= FILL_SCORE) conflicts.push("country");
    } else {
      const src = placeCountry ? ev.place! : ev.producer!;
      offer("country", countryLabel(catalogCountry), src.score, src.confidence, src.source, sameText);
    }
  }

  // Region / subregion from the matched place's hierarchy (never from an ambiguous place).
  if (ev.place && !ev.place.ambiguous) {
    const p = ev.place;
    const placeAgreesWithCountry = !fields.country.value || !p.country || countryOf(fields.country.value) === p.country;
    if (placeAgreesWithCountry) {
      offer("region", p.region, p.score, p.confidence, p.source, sameText);
      offer("subregion", p.subregion, p.score, p.confidence, p.source, sameText);
    } else {
      conflicts.push("region");
    }
  }

  // Wine-level facts only from a strong wine match.
  if (ev.wine) {
    const w = ev.wine;
    offer("producer", w.producer, w.score, w.confidence, w.source, (a, b) => normalizeProducer(a) === normalizeProducer(b));
    offer("wineType", w.wineType && isWineType(w.wineType) ? w.wineType : null, w.score, w.confidence, w.source, sameText);
    if (w.score >= FILL_SCORE) offer("grapes", w.grapes.length ? w.grapes : null, w.score, w.confidence, w.source, (a, b) => a.map(normalizeText).sort().join("|") === b.map(normalizeText).sort().join("|"));
  }

  return { fields, filled: [...new Set(filled)], agreed: [...new Set(agreed)], conflicts: [...new Set(conflicts)] };
}

/* ----------------------------------------------------------------------------
 * Contributions
 * ------------------------------------------------------------------------- */

/** Grouping key for user-confirmed identities: same producer and wine name, regardless of vintage. */
export function contributionKey(producer: string | null, name: string) {
  return `${normalizeProducer(producer)}|${normalizeText(name)}`;
}

/** Independent users who must confirm the same identity, with no disagreement, before it can be accepted. */
export const MIN_AGREEING_USERS = 3;

export type ContributionFields = { producer: string | null; name: string; country: string | null; region: string | null; appellation: string | null; wineType: string | null };

/**
 * Whether a group of pending contributions (one per user) agrees enough to be
 * accepted into the catalog. Every user must agree on every field any of them
 * gave; a single disagreement blocks acceptance until reviewed by hand.
 */
export function contributionConsensus(group: ContributionFields[]): { accept: boolean; reason: string; fields: ContributionFields | null } {
  if (group.length < MIN_AGREEING_USERS) return { accept: false, reason: `needs ${MIN_AGREEING_USERS} independent confirmations (has ${group.length})`, fields: null };
  const keys: (keyof ContributionFields)[] = ["producer", "name", "country", "region", "appellation", "wineType"];
  const merged = { ...group[0] };
  for (const key of keys) {
    const values = [...new Set(group.map((g) => g[key]).filter((v): v is string => v !== null && v !== "").map((v) => (key === "producer" ? normalizeProducer(v) : normalizeText(v))))];
    if (values.length > 1) return { accept: false, reason: `users disagree on ${key}`, fields: null };
    (merged as Record<keyof ContributionFields, string | null>)[key] = group.find((g) => g[key])?.[key] ?? null;
  }
  return { accept: true, reason: `${group.length} users agree`, fields: merged };
}
