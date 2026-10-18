/**
 * Rules for merging a duplicate wine record (source) into another (target).
 * Pure and deterministic: given both records, either a complete plan or the
 * reason the merge is refused. Nothing is invented — a merge that can't keep
 * every grape, share and provenance entry intact is refused, not guessed.
 */

export type Source = "user" | "provider" | "inferred";

export type Provenance = { source: Source; provider?: string; confidence?: number; confirmedAt?: string };

export type MergeGrapeRow = { id: string; grape: string; normalizedGrape: string; percentage: number | null; position: number; source: Source };

export type VintageIdentity = { vintage: number | null; isNonVintage: boolean };

/** Grape rules shared with wine validation. */
const MAX_GRAPES = 15;
const MAX_TOTAL_SHARE = 100.5;

export function describeVintage(v: VintageIdentity) {
  if (v.isNonVintage) return "non-vintage";
  return v.vintage === null ? "vintage unknown" : String(v.vintage);
}

/**
 * Two records describe the same vintage only when both are the same year, both
 * non-vintage, or both of unknown vintage. Non-vintage and unknown are distinct.
 */
export function sameVintage(a: VintageIdentity, b: VintageIdentity) {
  return a.isNonVintage === b.isNonVintage && a.vintage === b.vintage;
}

const USER: Provenance = { source: "user" };

function sameProvenance(a: Provenance | undefined, b: Provenance | undefined) {
  const x = a ?? USER;
  const y = b ?? USER;
  return x.source === y.source && x.provider === y.provider && x.confidence === y.confidence && x.confirmedAt === y.confirmedAt;
}

export type GrapeMergePlan =
  | {
      ok: true;
      /** Source rows re-pointed to the target, at these positions. */
      moves: { id: string; position: number }[];
      /** Target rows whose unknown share is filled from the matching source row. */
      shareUpdates: { id: string; percentage: number; source: Source }[];
      /** Provenance for the target's grapes after the merge. */
      provenance: Provenance | undefined;
    }
  | { ok: false; error: string };

/**
 * Combines both records' grapes.
 * - A grape only the source lists moves to the target, keeping its share and source.
 * - A grape both list keeps the target's row. Equal shares are a duplicate; a share
 *   known on one side only is kept; two different known shares are a conflict.
 * - The result must still satisfy the grape rules (count, total share).
 * - Provenance: unchanged when the source adds nothing; the source's when the target
 *   had no grapes; otherwise both must agree, as one field can't hold two origins.
 */
export function planGrapeMerge(
  target: { grapes: MergeGrapeRow[]; provenance: Provenance | undefined },
  source: { grapes: MergeGrapeRow[]; provenance: Provenance | undefined },
): GrapeMergePlan {
  const byName = new Map(target.grapes.map((g) => [g.normalizedGrape, g]));
  const moves: { id: string; position: number }[] = [];
  const shareUpdates: { id: string; percentage: number; source: Source }[] = [];
  const conflicts: string[] = [];
  let next = target.grapes.reduce((max, g) => Math.max(max, g.position + 1), 0);

  for (const g of [...source.grapes].sort((a, b) => a.position - b.position)) {
    const match = byName.get(g.normalizedGrape);
    if (!match) {
      moves.push({ id: g.id, position: next++ });
      continue;
    }
    if (g.percentage === null || g.percentage === match.percentage) continue;
    if (match.percentage === null) shareUpdates.push({ id: match.id, percentage: g.percentage, source: g.source });
    else conflicts.push(`${match.grape} is ${match.percentage}% on this record but ${g.percentage}% on the duplicate`);
  }
  if (conflicts.length) return { ok: false, error: `Grape shares disagree: ${conflicts.join("; ")}. Correct one record, then merge.` };

  const count = target.grapes.length + moves.length;
  if (count > MAX_GRAPES) return { ok: false, error: `Together these records list ${count} grapes; a wine can have at most ${MAX_GRAPES}.` };
  const filled = new Map(shareUpdates.map((u) => [u.id, u.percentage]));
  const movedIds = new Set(moves.map((m) => m.id));
  const total =
    target.grapes.reduce((sum, g) => sum + (filled.get(g.id) ?? g.percentage ?? 0), 0) +
    source.grapes.filter((g) => movedIds.has(g.id)).reduce((sum, g) => sum + (g.percentage ?? 0), 0);
  if (total > MAX_TOTAL_SHARE) return { ok: false, error: `Together these records' grape shares add up to ${Math.round(total * 100) / 100}%. Correct one record, then merge.` };

  const changed = moves.length > 0 || shareUpdates.length > 0;
  let provenance = target.provenance;
  if (changed && target.grapes.length === 0) provenance = source.provenance;
  else if (changed && !sameProvenance(target.provenance, source.provenance)) {
    return { ok: false, error: "The grapes on these records came from different sources (one entered by you, one read from a label, or two different readings). Make them agree on one record, then merge." };
  }
  return { ok: true, moves, shareUpdates, provenance };
}

export type ExternalIdsMerge = { ok: true; ids: Record<string, string> | null } | { ok: false; error: string };

/** Keeps every external identifier; the same key with two different values is a conflict. */
export function mergeExternalIds(target: Record<string, string> | null, source: Record<string, string> | null): ExternalIdsMerge {
  if (!source || !Object.keys(source).length) return { ok: true, ids: target };
  const ids = { ...(target ?? {}) };
  for (const [key, value] of Object.entries(source)) {
    if (key in ids && ids[key] !== value) return { ok: false, error: `These records carry different ${key} identifiers, so they may not be the same wine.` };
    ids[key] = value;
  }
  return { ok: true, ids };
}
