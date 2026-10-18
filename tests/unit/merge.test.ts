import { describe, expect, it } from "vitest";
import { mergeExternalIds, planGrapeMerge, sameVintage, type MergeGrapeRow, type Provenance } from "@/lib/domain/merge";

const row = (id: string, grape: string, percentage: number | null, position: number, source: MergeGrapeRow["source"] = "user"): MergeGrapeRow => ({
  id,
  grape,
  normalizedGrape: grape.toLowerCase(),
  percentage,
  position,
  source,
});
const user: Provenance = { source: "user" };
const label: Provenance = { source: "provider", provider: "anthropic", confidence: 0.9, confirmedAt: "2026-10-01T10:00:00.000Z" };

describe("sameVintage", () => {
  it("matches only identical vintage identities", () => {
    expect(sameVintage({ vintage: 2015, isNonVintage: false }, { vintage: 2015, isNonVintage: false })).toBe(true);
    expect(sameVintage({ vintage: null, isNonVintage: true }, { vintage: null, isNonVintage: true })).toBe(true);
    expect(sameVintage({ vintage: null, isNonVintage: false }, { vintage: null, isNonVintage: false })).toBe(true);
    expect(sameVintage({ vintage: 2015, isNonVintage: false }, { vintage: 2016, isNonVintage: false })).toBe(false);
    expect(sameVintage({ vintage: null, isNonVintage: true }, { vintage: null, isNonVintage: false })).toBe(false);
    expect(sameVintage({ vintage: 2015, isNonVintage: false }, { vintage: null, isNonVintage: false })).toBe(false);
  });
});

describe("planGrapeMerge", () => {
  it("moves the source's grapes, and their provenance, to a target without grapes", () => {
    const plan = planGrapeMerge({ grapes: [], provenance: user }, { grapes: [row("s1", "Syrah", 85, 0, "provider"), row("s2", "Viognier", 15, 1, "provider")], provenance: label });
    expect(plan).toEqual({ ok: true, moves: [{ id: "s1", position: 0 }, { id: "s2", position: 1 }], shareUpdates: [], provenance: label });
  });

  it("appends new source grapes after the target's own", () => {
    const plan = planGrapeMerge({ grapes: [row("t1", "Merlot", null, 0)], provenance: user }, { grapes: [row("s1", "Cabernet Franc", null, 0)], provenance: user });
    expect(plan).toEqual({ ok: true, moves: [{ id: "s1", position: 1 }], shareUpdates: [], provenance: user });
  });

  it("treats a grape listed on both with the same share as one grape", () => {
    const plan = planGrapeMerge({ grapes: [row("t1", "Merlot", 60, 0), row("t2", "Cabernet Franc", 40, 1)], provenance: label }, { grapes: [row("s1", "Merlot", 60, 0)], provenance: user });
    expect(plan).toEqual({ ok: true, moves: [], shareUpdates: [], provenance: label });
  });

  it("keeps a share known on only one side, never inventing one", () => {
    const fill = planGrapeMerge({ grapes: [row("t1", "Merlot", null, 0)], provenance: user }, { grapes: [row("s1", "Merlot", 100, 0)], provenance: user });
    expect(fill).toEqual({ ok: true, moves: [], shareUpdates: [{ id: "t1", percentage: 100, source: "user" }], provenance: user });
    const keep = planGrapeMerge({ grapes: [row("t1", "Merlot", 100, 0)], provenance: user }, { grapes: [row("s1", "Merlot", null, 0)], provenance: label });
    expect(keep).toEqual({ ok: true, moves: [], shareUpdates: [], provenance: user });
  });

  it("refuses two different known shares for the same grape", () => {
    const plan = planGrapeMerge({ grapes: [row("t1", "Merlot", 60, 0)], provenance: user }, { grapes: [row("s1", "Merlot", 70, 0)], provenance: user });
    expect(plan).toEqual({ ok: false, error: expect.stringContaining("Merlot is 60% on this record but 70% on the duplicate") });
  });

  it("refuses a combination whose shares exceed 100% or that lists too many grapes", () => {
    const over = planGrapeMerge({ grapes: [row("t1", "Merlot", 60, 0), row("t2", "Cabernet Franc", 40, 1)], provenance: user }, { grapes: [row("s1", "Petit Verdot", 10, 0)], provenance: user });
    expect(over).toEqual({ ok: false, error: expect.stringContaining("110%") });
    const many = planGrapeMerge(
      { grapes: Array.from({ length: 10 }, (_, i) => row(`t${i}`, `T${i}`, null, i)), provenance: user },
      { grapes: Array.from({ length: 6 }, (_, i) => row(`s${i}`, `S${i}`, null, i)), provenance: user },
    );
    expect(many).toEqual({ ok: false, error: expect.stringContaining("16 grapes") });
  });

  it("refuses to combine grapes of different origin rather than relabel either", () => {
    const plan = planGrapeMerge({ grapes: [row("t1", "Merlot", null, 0)], provenance: user }, { grapes: [row("s1", "Malbec", null, 0, "provider")], provenance: label });
    expect(plan.ok).toBe(false);
    const twoReadings = planGrapeMerge({ grapes: [row("t1", "Merlot", null, 0, "provider")], provenance: label }, { grapes: [row("s1", "Malbec", null, 0, "provider")], provenance: { ...label, confirmedAt: "2026-10-02T10:00:00.000Z" } });
    expect(twoReadings.ok).toBe(false);
  });
});

describe("mergeExternalIds", () => {
  it("keeps every identifier and refuses conflicting values", () => {
    expect(mergeExternalIds(null, null)).toEqual({ ok: true, ids: null });
    expect(mergeExternalIds({ lwin: "1" }, { vivino: "2" })).toEqual({ ok: true, ids: { lwin: "1", vivino: "2" } });
    expect(mergeExternalIds({ lwin: "1" }, { lwin: "1" })).toEqual({ ok: true, ids: { lwin: "1" } });
    expect(mergeExternalIds({ lwin: "1" }, { lwin: "2" }).ok).toBe(false);
  });
});
