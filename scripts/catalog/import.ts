/**
 * Imports a fetched source snapshot into the catalog.
 *
 *   npm run catalog:import -- --source wikidata --dir data/catalog/wikidata/2026-10-19            (dry run)
 *   npm run catalog:import -- --source wikidata --dir data/catalog/wikidata/2026-10-19 --apply
 *
 * Dry run is the default: the whole import runs in a transaction that is then
 * rolled back, and the report shows what would change. Re-running a snapshot
 * changes nothing (idempotent). Failure rolls back everything; fix and re-run.
 * Records missing from a newer snapshot are reported as stale, never deleted.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CATALOG_SOURCES } from "../../src/server/reference/sources";
import { wikidataToBatch, type WikidataFiles } from "../../src/server/reference/wikidata";
import { openFoodFactsToBatch } from "../../src/server/reference/openfoodfacts";
import { importCatalogBatch } from "../../src/server/reference/import";
import { closeDb } from "../../src/server/db";
import { arg, databaseTarget } from "./target";

const MAX_OFF_BYTES = 200 * 1024 * 1024;

async function main() {
  const argv = process.argv.slice(2);
  const sourceId = arg(argv, "--source");
  const dir = arg(argv, "--dir");
  const apply = argv.includes("--apply");
  if (!dir || (sourceId !== "wikidata" && sourceId !== "openfoodfacts")) {
    throw new Error("Usage: --source wikidata|openfoodfacts --dir <snapshot dir> [--apply]");
  }
  const source = CATALOG_SOURCES[sourceId];
  if (apply && !source.approvedForLookup && !argv.includes("--allow-unapproved")) {
    throw new Error(`${source.name} is not approved (see docs/catalog-sources.md). Importing it needs --allow-unapproved after a licensing decision.`);
  }
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { source: string; retrievedAt: string };
  if (manifest.source !== sourceId) throw new Error(`Snapshot is for ${manifest.source}, not ${sourceId}.`);
  const retrievedAt = new Date(manifest.retrievedAt);
  if (Number.isNaN(retrievedAt.getTime())) throw new Error("manifest.json has no valid retrievedAt.");

  let batch;
  const notes: Record<string, number> = {};
  if (sourceId === "wikidata") {
    const read = (f: string) => JSON.parse(readFileSync(join(dir, `${f}.json`), "utf8"));
    batch = wikidataToBatch({ regions: read("regions"), producers: read("producers"), grapes: read("grapes"), wines: read("wines") } as WikidataFiles);
  } else {
    const raw = readFileSync(join(dir, "products.jsonl"));
    if (raw.length > MAX_OFF_BYTES) throw new Error("products.jsonl is larger than 200 MB; pre-filter it to wines first (see docs/catalog.md).");
    const parsed = openFoodFactsToBatch(raw.toString("utf8").split("\n"));
    batch = parsed.batch;
    notes.malformedLines = parsed.malformed;
    notes.skippedNotWine = parsed.skippedNotWine;
  }

  const target = databaseTarget(argv);
  console.log(`[catalog:import] source=${sourceId} target=${target.label} mode=${apply ? "apply" : "dry-run"} retrievedAt=${manifest.retrievedAt}`);
  const report = await importCatalogBatch(source, batch, { dryRun: !apply, retrievedAt });
  const { rejected, ...counts } = report;
  console.log(JSON.stringify({ ...counts, ...notes, rejectedCount: rejected.length, rejectedSample: rejected.slice(0, 20) }, null, 2));
}

main()
  .catch((error) => {
    console.error("[catalog:import] Failed, nothing was written:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
