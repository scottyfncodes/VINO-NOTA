/**
 * Operator review of user contributions. Lists pending identities and whether
 * enough users confirmed them identically (contributionConsensus). With
 * --apply, accepted groups are imported into the catalog under the
 * "contributions" source (same idempotent import as any other source) and
 * marked accepted; nothing is published without this explicit step.
 *
 *   npm run catalog:review              (report only)
 *   npm run catalog:review -- --apply
 */
import "dotenv/config";
import { contributionConsensus, type ImportBatch } from "../../src/lib/domain/catalog";
import { normalizeProducer } from "../../src/lib/domain/normalize";
import { CATALOG_SOURCES } from "../../src/server/reference/sources";
import { importCatalogBatch } from "../../src/server/reference/import";
import { pendingContributionGroups, setContributionStatus } from "../../src/server/reference/contributions";
import { closeDb } from "../../src/server/db";
import { databaseTarget } from "./target";

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const target = databaseTarget(argv);
  console.log(`[catalog:review] target=${target.label} mode=${apply ? "apply" : "report"}`);

  const groups = await pendingContributionGroups();
  const batch: ImportBatch = { regions: [], producers: [], grapes: [], wines: [], products: [] };
  const accepted: string[] = [];
  for (const [key, group] of groups) {
    const verdict = contributionConsensus(group);
    console.log(`${verdict.accept ? "ACCEPT" : "hold  "} ${key} (${group.length} users): ${verdict.reason}`);
    if (!verdict.accept || !verdict.fields?.producer) continue;
    const f = verdict.fields;
    const producerId = `producer:${normalizeProducer(f.producer)}`;
    if (!batch.producers.some((p) => p.externalId === producerId)) {
      batch.producers.push({ externalId: producerId, name: f.producer!, country: f.country, regionExternalId: null, aliases: [] });
    }
    batch.wines.push({ externalId: `wine:${key}`, name: f.name, producerExternalId: producerId, wineType: f.wineType, regionExternalId: null, country: f.country, grapeExternalIds: [], aliases: [] });
    accepted.push(key);
  }
  if (!accepted.length) {
    console.log("[catalog:review] Nothing has reached consensus.");
    return;
  }
  const report = await importCatalogBatch(CATALOG_SOURCES.contributions, batch, { dryRun: !apply, retrievedAt: new Date() });
  console.log(JSON.stringify({ wines: report.wines, producers: report.producers, rejected: report.rejected }, null, 2));
  if (apply) for (const key of accepted) await setContributionStatus(key, "accepted");
}

main()
  .catch((error) => {
    console.error("[catalog:review] Failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
