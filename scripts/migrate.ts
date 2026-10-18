/**
 * Applies pending SQL migrations from ./drizzle to DATABASE_URL.
 * Used locally (`npm run db:migrate`) and in the Vercel build step so each
 * environment migrates its own database.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (process.env.VERCEL) {
      throw new Error("DATABASE_URL must be set for Vercel builds.");
    }
    console.log("[migrate] DATABASE_URL not set; skipping migrations.");
    return;
  }
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
