/**
 * Catalog lookup for a label reading. Database only (no AI calls), bounded by
 * a statement timeout and small LIMITs, and limited to sources approved for
 * lookups. Failure or timeout returns no evidence; recognition carries on.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { normalizeProducer, normalizeText } from "@/lib/domain/normalize";
import { countryCodeFromName } from "@/lib/domain/countries";
import { FILL_SCORE, SUGGEST_SCORE, type CatalogEvidence, type RegionKind } from "@/lib/domain/catalog";
import { placeHierarchy } from "@/lib/domain/place";

export type LookupInput = { producer: string | null; name: string | null; country: string | null; region: string | null; appellation: string | null };
export type CatalogMatchSummary = { kind: "producer" | "place" | "wine"; name: string; score: number; source: string };
export type LookupResult = { evidence: CatalogEvidence; matches: CatalogMatchSummary[] };

export const LOOKUP_TIMEOUT_MS = 1500;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; result: LookupResult }>();

/** Test hook. */
export function clearCatalogLookupCache() {
  cache.clear();
}

type Row = Record<string, unknown>;
const rows = async (tx: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> }, q: ReturnType<typeof sql>) => {
  const r = (await tx.execute(q)) as unknown;
  return (Array.isArray(r) ? r : ((r as { rows?: Row[] }).rows ?? [])) as Row[];
};

export async function lookupCatalog(input: LookupInput): Promise<LookupResult> {
  const producerKey = normalizeProducer(input.producer);
  const nameKey = normalizeText(input.name);
  const placeKey = normalizeText(input.appellation) || normalizeText(input.region);
  const placeMatchedFrom = normalizeText(input.appellation) ? "appellation" : "region";
  const country = input.country ? countryCodeFromName(input.country) : null;
  const empty: LookupResult = { evidence: {}, matches: [] };
  if (!producerKey && !placeKey) return empty;

  // The place's region also depends on where the place text came from and on the label's region text.
  const cacheKey = [producerKey, nameKey, placeKey, placeMatchedFrom, normalizeText(input.region), country ?? ""].join("|");
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.result;

  try {
    const result = await getDb().transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${LOOKUP_TIMEOUT_MS}`));
      const evidence: CatalogEvidence = {};
      const matches: CatalogMatchSummary[] = [];

      // Producer: exact name/alias first, else the best trigram match.
      let producerIds: string[] = [];
      if (producerKey) {
        let found = await rows(
          tx,
          sql`SELECT DISTINCT p.id, p.name, p.country, p.confidence, p.source_id, 1.0::float AS score
              FROM catalog_producer p JOIN catalog_source s ON s.id = p.source_id AND s.approved_for_lookup
              LEFT JOIN catalog_alias a ON a.entity = 'producer' AND a.entity_id = p.id
              WHERE p.normalized_name = ${producerKey} OR a.normalized_alias = ${producerKey}
              LIMIT 5`,
        );
        if (!found.length) {
          found = await rows(
            tx,
            sql`SELECT p.id, p.name, p.country, p.confidence, p.source_id, similarity(p.normalized_name, ${producerKey})::float AS score
                FROM catalog_producer p JOIN catalog_source s ON s.id = p.source_id AND s.approved_for_lookup
                WHERE p.normalized_name % ${producerKey}
                ORDER BY score DESC LIMIT 5`,
          );
          found = found.filter((r) => Number(r.score) >= SUGGEST_SCORE).slice(0, 1);
        }
        if (found.length) {
          const countries = new Set(found.map((r) => r.country));
          const best = found[0];
          const score = found.length > 1 && countries.size > 1 ? Math.min(Number(best.score), 0.85) : Number(best.score);
          evidence.producer = { name: String(best.name), country: countries.size === 1 ? ((best.country as string) ?? null) : null, score, confidence: Number(best.confidence), source: String(best.source_id) };
          producerIds = Number(best.score) >= FILL_SCORE ? found.map((r) => String(r.id)) : [];
          matches.push({ kind: "producer", name: String(best.name), score, source: String(best.source_id) });
        }
      }

      // Place: the appellation (or region) the label named, with its hierarchy.
      if (placeKey) {
        let found = await rows(
          tx,
          sql`SELECT DISTINCT r.id, r.kind, r.name, r.country, r.confidence, r.source_id, 1.0::float AS score
              FROM catalog_region r JOIN catalog_source s ON s.id = r.source_id AND s.approved_for_lookup
              LEFT JOIN catalog_alias a ON a.entity = 'region' AND a.entity_id = r.id
              WHERE r.normalized_name = ${placeKey} OR a.normalized_alias = ${placeKey}
              LIMIT 10`,
        );
        if (!found.length) {
          found = await rows(
            tx,
            sql`SELECT r.id, r.kind, r.name, r.country, r.confidence, r.source_id, similarity(r.normalized_name, ${placeKey})::float AS score
                FROM catalog_region r JOIN catalog_source s ON s.id = r.source_id AND s.approved_for_lookup
                WHERE r.normalized_name % ${placeKey}
                ORDER BY score DESC LIMIT 3`,
          );
          found = found.filter((r) => Number(r.score) >= SUGGEST_SCORE).slice(0, 1);
        }
        if (country) {
          const inCountry = found.filter((r) => r.country === country || r.country === null);
          if (inCountry.length) found = inCountry;
        }
        if (found.length) {
          // Prefer an appellation over a region of the same name.
          found.sort((a, b) => Number(b.score) - Number(a.score) || (a.kind === "appellation" ? -1 : 1) - (b.kind === "appellation" ? -1 : 1));
          const best = found[0];
          const ambiguous = found.filter((r) => Number(r.score) === Number(best.score) && r.kind === best.kind).length > 1;
          const chain = await rows(
            tx,
            sql`WITH RECURSIVE up(id, parent_id, kind, name, depth) AS (
                  SELECT id, parent_id, kind, name, 0 FROM catalog_region WHERE id = ${best.id}
                  UNION ALL SELECT r.id, r.parent_id, r.kind, r.name, up.depth + 1 FROM catalog_region r JOIN up ON r.id = up.parent_id WHERE up.depth < 4)
                SELECT kind, name, depth FROM up WHERE depth > 0 ORDER BY depth`,
          );
          const { region, subregion } = placeHierarchy(
            { kind: best.kind as RegionKind, name: String(best.name) },
            chain.map((c) => ({ kind: c.kind as RegionKind, name: String(c.name) })),
            { matchedFrom: placeMatchedFrom, region: input.region },
          );
          evidence.place = {
            kind: best.kind as RegionKind,
            name: String(best.name),
            country: (best.country as string) ?? null,
            region,
            subregion,
            score: Number(best.score),
            confidence: Number(best.confidence),
            source: String(best.source_id),
            ambiguous,
          };
          matches.push({ kind: "place", name: String(best.name), score: Number(best.score), source: String(best.source_id) });
        }
      }

      // Wine: only within an exactly matched producer — never by name alone.
      if (producerIds.length && nameKey) {
        const found = await rows(
          tx,
          sql`SELECT w.id, w.name, w.wine_type, w.confidence, w.source_id, p.name AS producer,
                     CASE WHEN w.normalized_name = ${nameKey} OR a.normalized_alias = ${nameKey} THEN 1.0 ELSE similarity(w.normalized_name, ${nameKey}) END::float AS score
              FROM catalog_wine w JOIN catalog_source s ON s.id = w.source_id AND s.approved_for_lookup
              LEFT JOIN catalog_producer p ON p.id = w.producer_id
              LEFT JOIN catalog_alias a ON a.entity = 'wine' AND a.entity_id = w.id AND a.normalized_alias = ${nameKey}
              WHERE w.producer_id IN (${sql.join(producerIds.map((id) => sql`${id}::uuid`), sql`, `)})
              ORDER BY score DESC LIMIT 1`,
        );
        const best = found[0];
        if (best && Number(best.score) >= SUGGEST_SCORE) {
          const grapes = await rows(tx, sql`SELECT g.name FROM catalog_wine_grape wg JOIN catalog_grape g ON g.id = wg.grape_id WHERE wg.wine_id = ${best.id} ORDER BY g.name LIMIT 15`);
          evidence.wine = {
            name: String(best.name),
            producer: (best.producer as string) ?? null,
            wineType: (best.wine_type as string) ?? null,
            grapes: grapes.map((g) => String(g.name)),
            score: Number(best.score),
            confidence: Number(best.confidence),
            source: String(best.source_id),
          };
          matches.push({ kind: "wine", name: String(best.name), score: Number(best.score), source: String(best.source_id) });
        }
      }
      return { evidence, matches };
    });
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, { at: Date.now(), result });
    return result;
  } catch {
    console.error("[catalog] lookup failed or timed out");
    return empty;
  }
}
