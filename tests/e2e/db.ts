import postgres from "postgres";
import { assertLocalDatabaseUrl } from "../support/local-database";

/**
 * Direct access to the e2e app's database, for states the UI can't create
 * (label-read provenance, external ids) and for checking what a merge changed.
 * Refuses anything but a local database.
 */
const url = assertLocalDatabaseUrl(process.env.DATABASE_URL ?? "postgresql://vino:vino@localhost:5432/vinonota");

export const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

export async function setGrapes(wineId: string, grapes: { name: string; percentage: number | null; source?: "user" | "provider" }[]) {
  await sql`delete from wine_grape where wine_id = ${wineId}`;
  for (const [position, g] of grapes.entries()) {
    await sql`insert into wine_grape (wine_id, grape, normalized_grape, percentage, position, source)
      values (${wineId}, ${g.name}, ${g.name.toLowerCase()}, ${g.percentage}, ${position}, ${g.source ?? "user"})`;
  }
}

export async function setProvenance(wineId: string, field: string, provenance: Record<string, unknown>) {
  await sql`update wine set field_provenance = jsonb_set(field_provenance, ${[field]}, ${sql.json(provenance as postgres.JSONValue)}) where id = ${wineId}`;
}

export async function setExternalIds(wineId: string, ids: Record<string, string>) {
  await sql`update wine set external_ids = ${sql.json(ids)} where id = ${wineId}`;
}

/** Everything a merge could touch, for before/after comparison. */
export async function snapshot(...wineIds: string[]) {
  const wines = await sql`select * from wine where id in ${sql(wineIds)} order by id`;
  const grapes = await sql`select * from wine_grape where wine_id in ${sql(wineIds)} order by id`;
  const tastings = await sql`select * from tasting where wine_id in ${sql(wineIds)} order by id`;
  const ids = tastings.map((t) => t.id as string);
  const observations = ids.length ? await sql`select * from sensory_observation where tasting_id in ${sql(ids)} order by id` : [];
  const images = await sql`select * from wine_image where wine_id in ${sql(wineIds)} order by id`;
  const sources = await sql`select * from metadata_source_record where wine_id in ${sql(wineIds)} order by id`;
  return JSON.parse(JSON.stringify({ wines, grapes, tastings, observations, images, sources }));
}

/**
 * Makes every unused reset link for this email already expired. Uses its own
 * connection because merge.spec.ts ends the shared one, and all spec files run
 * in one worker.
 */
export async function expireResetLinks(email: string) {
  const db = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await db`update verification set expires_at = now() - interval '1 minute'
      where identifier like 'reset-password:%' and value = (select id from "user" where email = ${email})`;
  } finally {
    await db.end({ timeout: 5 });
  }
}
