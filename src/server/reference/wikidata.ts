/**
 * Wikidata (CC0) → catalog records. Reads SPARQL JSON result files written by
 * scripts/catalog/fetch-wikidata.ts; no network access here.
 */
import type { GrapeRecord, ImportBatch, ProducerRecord, RegionKind, RegionRecord, WineRecord } from "@/lib/domain/catalog";

/**
 * Wikidata classes the fetch script queries. Each class's English label is
 * checked against `expectLabel` before any snapshot is written, so a wrong id
 * stops the fetch instead of importing the wrong kind of item.
 */
export const WIKIDATA_CLASSES = {
  winery: { id: "Q156362", expectLabel: "winery" },
  grapeVariety: { id: "Q10978", expectLabel: "grape variety" },
  wineRegion: { id: "Q1474389", expectLabel: "wine-producing region", kind: "region" as RegionKind },
  appellation: { id: "Q1424287", expectLabel: "appellation", kind: "appellation" as RegionKind },
  wine: { id: "Q282", expectLabel: "wine" },
} as const;

type Binding = Record<string, { type: string; value: string } | undefined>;
export type SparqlResult = { head: { vars: string[] }; results: { bindings: Binding[] } };

const qid = (uri: string | undefined) => (uri ? (uri.match(/\/entity\/(Q\d+)$/)?.[1] ?? null) : null);
const text = (b: Binding, key: string) => b[key]?.value?.trim() || null;
const aliases = (b: Binding) => (text(b, "alts") ?? "").split("|").map((a) => a.trim()).filter(Boolean);
/** A label equal to the Q-id means the item has no label in the requested languages. */
const labelOf = (b: Binding, id: string) => {
  const l = text(b, "itemLabel");
  return l && l !== id ? l : null;
};

export type WikidataFiles = { regions: SparqlResult; producers: SparqlResult; grapes: SparqlResult; wines: SparqlResult };

/** Converts fetched SPARQL results into an import batch. Records without a usable label are skipped. */
export function wikidataToBatch(files: WikidataFiles): ImportBatch {
  const regions: RegionRecord[] = [];
  for (const b of files.regions.results.bindings) {
    const id = qid(b.item?.value);
    if (!id) continue;
    const name = labelOf(b, id);
    if (!name) continue;
    const kind = text(b, "kind") as RegionKind | null;
    regions.push({ externalId: id, kind: kind === "appellation" || kind === "subregion" ? kind : "region", name, country: text(b, "iso")?.toUpperCase() ?? null, parentExternalId: qid(b.parent?.value), aliases: aliases(b) });
  }
  const regionIds = new Set(regions.map((r) => r.externalId));
  // Only keep parents that are themselves catalog places (Wikidata "part of" can point anywhere).
  for (const r of regions) if (r.parentExternalId && !regionIds.has(r.parentExternalId)) r.parentExternalId = null;

  const producers: ProducerRecord[] = [];
  for (const b of files.producers.results.bindings) {
    const id = qid(b.item?.value);
    if (!id) continue;
    const name = labelOf(b, id);
    if (!name) continue;
    const region = qid(b.region?.value);
    producers.push({ externalId: id, name, country: text(b, "iso")?.toUpperCase() ?? null, regionExternalId: region && regionIds.has(region) ? region : null, aliases: aliases(b) });
  }

  const grapes: GrapeRecord[] = [];
  for (const b of files.grapes.results.bindings) {
    const id = qid(b.item?.value);
    if (!id) continue;
    const name = labelOf(b, id);
    if (name) grapes.push({ externalId: id, name, aliases: aliases(b) });
  }
  const grapeIds = new Set(grapes.map((g) => g.externalId));
  const producerIds = new Set(producers.map((p) => p.externalId));

  const wines: WineRecord[] = [];
  for (const b of files.wines.results.bindings) {
    const id = qid(b.item?.value);
    if (!id) continue;
    const name = labelOf(b, id);
    if (!name) continue;
    const producer = qid(b.producer?.value);
    const region = qid(b.region?.value);
    const grapeList = (text(b, "grapes") ?? "").split("|").map((g) => qid(g)).filter((g): g is string => g !== null && grapeIds.has(g));
    wines.push({
      externalId: id,
      name,
      producerExternalId: producer && producerIds.has(producer) ? producer : null,
      wineType: null,
      regionExternalId: region && regionIds.has(region) ? region : null,
      country: text(b, "iso")?.toUpperCase() ?? null,
      grapeExternalIds: grapeList,
      aliases: aliases(b),
    });
  }
  return { regions, producers, grapes, wines, products: [] };
}
