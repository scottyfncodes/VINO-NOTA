/**
 * Applies pending SQL migrations from ./drizzle to the database the app will
 * use (DATABASE_URL, or CATALOG_UAT_DATABASE_URL on the catalog UAT Preview).
 * Used locally (`npm run db:migrate`) and in the Vercel build step so each
 * environment migrates its own database.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { assertPreviewIsolation, selectDatabaseUrl } from "../src/server/db/target";

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
  console.log(`[migrate] env=${process.env.VERCEL_ENV ?? "local"} source=${source} endpoint=${target.endpointId ?? target.host} database=${target.database}`);
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
    console.log("[migrate] Migrations applied.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("[migrate] Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
