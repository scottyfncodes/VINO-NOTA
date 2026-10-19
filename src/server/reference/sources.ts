/**
 * The data sources the catalog may hold, mirroring docs/catalog-sources.md.
 * `approvedForLookup` is a licensing decision: only approved sources are used
 * to complete readings. Changing it requires a reviewed code change.
 */
export type CatalogSourceMeta = { id: string; name: string; url: string; license: string; attribution: string | null; approvedForLookup: boolean; /** Trust in the source's records, 0–1; caps the confidence of anything it fills. */ confidence: number };

export const CATALOG_SOURCES = {
  wikidata: {
    id: "wikidata",
    name: "Wikidata",
    url: "https://www.wikidata.org/",
    license: "CC0 1.0 (structured data)",
    attribution: "Includes data from Wikidata (CC0).",
    approvedForLookup: true,
    // Community-edited: good for places and producers, not authoritative.
    confidence: 0.9,
  },
  openfoodfacts: {
    id: "openfoodfacts",
    name: "Open Food Facts",
    url: "https://world.openfoodfacts.org/",
    license: "ODbL 1.0 (database), DbCL 1.0 (contents); images CC BY-SA, not imported",
    attribution: "Contains information from Open Food Facts, made available under the Open Database License (ODbL).",
    // Isolated: ODbL share-alike would extend to the catalog it is combined into. Awaiting approval.
    approvedForLookup: false,
    confidence: 0.7,
  },
  contributions: {
    id: "contributions",
    name: "Vino Nota user confirmations",
    url: "https://vino-nota.vercel.app/",
    license: "Internal; identities confirmed independently by several users, reviewed before acceptance",
    attribution: null,
    approvedForLookup: true,
    confidence: 0.8,
  },
} as const satisfies Record<string, CatalogSourceMeta>;

export type CatalogSourceId = keyof typeof CATALOG_SOURCES;
