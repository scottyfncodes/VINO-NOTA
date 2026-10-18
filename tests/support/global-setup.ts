import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { assertLocalDatabaseUrl } from "./local-database";

/** Rebuilds the test database schema from the committed migrations. Local databases only. */
export default async function setup() {
  const url = assertLocalDatabaseUrl(process.env.TEST_DATABASE_URL ?? "postgresql://vino:vino@localhost:5432/vinonota_test");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  await sql.end();
}
