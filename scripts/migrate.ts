/**
 * Applies pending SQL migrations from ./drizzle to the database the app will
 * use (DATABASE_URL, or CATALOG_UAT_DATABASE_URL on the catalog UAT Preview).
 * Used locally (`npm run db:migrate`) and in Preview builds, so each Preview
 * migrates its own branch.
 *
 * Production is never migrated here by a build: Production builds only check
 * (see migrationPlan). `--check` reports pending migrations without writing and
 * exits 2 when there are any. The Production migration workflow applies them
 * with --allow-production and MIGRATION_CONFIRM_ENDPOINT.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { assertPreviewIsolation, migrationPlan, pendingMigrations, selectDatabaseUrl } from "../src/server/db/target";

const PENDING_EXIT_CODE = 2;

async function pending(sql: postgres.Sql): Promise<string[]> {
  const journal = JSON.parse(readFileSync("./drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string; when: number }[] };
  const [{ exists }] = await sql<{ exists: boolean }[]>`SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS exists`;
  const last = exists ? (await sql<{ created_at: string }[]>`SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1`)[0] : undefined;
  return pendingMigrations(journal.entries, last ? Number(last.created_at) : null);
}

async function main() {
  const selected = selectDatabaseUrl();
  if (!selected) {
    if (process.env.VERCEL) {
      throw new Error("DATABASE_URL must be set for Vercel builds.");
    }
    console.log("[migrate] DATABASE_URL not set; skipping migrations.");
    return;
  }
  // Throws before connecting if a Preview build would migrate Production.
  const { url, source } = selected;
  const target = assertPreviewIsolation(url);
  const plan = migrationPlan(target, process.env, process.argv.slice(2));
  console.log(`[migrate] env=${process.env.VERCEL_ENV ?? "local"} source=${source} endpoint=${target.endpointId ?? target.host} database=${target.database} action=${plan.action}`);
  if (plan.action === "refuse") throw new Error(plan.reason);

  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const before = await pending(sql);
    if (plan.action === "check") {
      console.log(`[migrate] Check only (${plan.reason}). Pending: ${before.length ? before.join(", ") : "none"}.`);
      if (before.length) {
        console.error("[migrate] Pending migrations must be applied before this deployment. Run the Production migration workflow, then redeploy.");
        process.exitCode = PENDING_EXIT_CODE;
      }
      return;
    }
    if (!before.length) {
      console.log("[migrate] Nothing to apply.");
      return;
    }
    const [point] = await sql<{ at: string; lsn: string }[]>`SELECT now()::text AS at, pg_current_wal_lsn()::text AS lsn`;
    console.log(`[migrate] Applying ${before.join(", ")}. Restore point before applying: ${point.at} (LSN ${point.lsn}).`);
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
    const after = await pending(sql);
    if (after.length) throw new Error(`Still pending after applying: ${after.join(", ")}`);
    console.log("[migrate] Migrations applied.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("[migrate] Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
