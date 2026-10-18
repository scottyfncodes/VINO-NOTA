import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __vinoDb?: Database; __vinoSql?: postgres.Sql };

/**
 * Lazily creates the database client so that builds and tooling never need a
 * connection string. In development the client is cached across hot reloads.
 */
export function getDb(): Database {
  if (globalForDb.__vinoDb) return globalForDb.__vinoDb;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not configured.");
  }
  const sql = postgres(url, {
    // Pooled serverless connections (e.g. Neon/PgBouncer) do not support
    // session-level prepared statements.
    prepare: false,
    max: process.env.NODE_ENV === "production" ? 5 : 10,
    idle_timeout: 20,
    onnotice: () => {},
  });
  globalForDb.__vinoSql = sql;
  globalForDb.__vinoDb = drizzle(sql, { schema });
  return globalForDb.__vinoDb;
}

export async function closeDb() {
  await globalForDb.__vinoSql?.end({ timeout: 5 });
  globalForDb.__vinoSql = undefined;
  globalForDb.__vinoDb = undefined;
}

export { schema };
