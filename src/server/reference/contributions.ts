/**
 * User-confirmed identities as catalog candidates. Off unless
 * CATALOG_CONTRIBUTIONS=on (pending a privacy notice). A contribution never
 * changes the reference catalog by itself: an operator reviews groups with
 * `npm run catalog:review`, which only accepts identities several users
 * confirmed identically. Deleted with the account (ON DELETE CASCADE).
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { catalogContribution } from "@/server/db/schema";
import { contributionKey, type ContributionFields } from "@/lib/domain/catalog";
import type { WineInput } from "@/lib/domain/validation";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export const contributionsEnabled = () => process.env.CATALOG_CONTRIBUTIONS === "on";

const FIELDS = ["producer", "name", "country", "region", "appellation", "wineType"] as const;

/** Records (or refreshes) the user's confirmed identity. Vintage, price and tasting data are never included. */
export async function recordContribution(tx: Tx, userId: string, w: WineInput) {
  if (!contributionsEnabled() || !w.producer || !w.name) return;
  const fields: ContributionFields = {
    producer: w.producer,
    name: w.name,
    country: w.country,
    region: w.region,
    appellation: w.appellation,
    wineType: w.wineType,
  };
  const fieldOrigins: Record<string, string> = {};
  for (const f of FIELDS) {
    const p = w.provenance[f as keyof typeof w.provenance];
    fieldOrigins[f] = !p || p.source === "user" ? "user" : p.provider?.startsWith("catalog:") ? "catalog" : "label";
  }
  await tx
    .insert(catalogContribution)
    .values({ userId, identityKey: contributionKey(w.producer, w.name), fields, fieldOrigins })
    .onConflictDoUpdate({
      target: [catalogContribution.userId, catalogContribution.identityKey],
      set: { fields, fieldOrigins, status: "pending", createdAt: sql`now()` },
    });
}

/** The user's own contributions, for the account export. */
export async function listContributions(userId: string) {
  return getDb().query.catalogContribution.findMany({
    where: eq(catalogContribution.userId, userId),
    columns: { identityKey: true, fields: true, fieldOrigins: true, status: true, createdAt: true },
    orderBy: asc(catalogContribution.createdAt),
  });
}

/** Operator review: pending contributions grouped by identity. Never exposed through the app. */
export async function pendingContributionGroups() {
  const rows = await getDb()
    .select({ identityKey: catalogContribution.identityKey, userId: catalogContribution.userId, fields: catalogContribution.fields })
    .from(catalogContribution)
    .where(eq(catalogContribution.status, "pending"));
  const groups = new Map<string, ContributionFields[]>();
  for (const r of rows) groups.set(r.identityKey, [...(groups.get(r.identityKey) ?? []), r.fields as ContributionFields]);
  return groups;
}

export async function setContributionStatus(identityKey: string, status: "accepted" | "rejected") {
  await getDb()
    .update(catalogContribution)
    .set({ status })
    .where(and(eq(catalogContribution.identityKey, identityKey), eq(catalogContribution.status, "pending")));
}
