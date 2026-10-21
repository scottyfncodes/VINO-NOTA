import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { RegionKind, RegionRecord } from "@/lib/domain/catalog";
import { namesDesignation } from "@/lib/domain/place";
import { applyRegionDecisions, REGION_DECISIONS, type RegionDecision } from "@/server/reference/region-decisions";

type ProposalRecord = { id: string; name: string; parent: string | null; currentKind: string; proposedKind: string; parentAction: string };
const proposal = JSON.parse(readFileSync("docs/catalog-classification-proposal.json", "utf8")) as { records: ProposalRecord[] };
const proposed = new Map(proposal.records.map((r) => [r.id, r]));

// Decisions the approval added beyond the proposal's own rows (recommended defaults for Q-IT-DUP, Q-NZ-COUNTRY, Q-UNESCO).
const EXTRA = { twins: ["Q140131443", "Q140131124", "Q140131139"], parentCleared: ["Q117074142", "Q19865", "Q19868"], aliasesOnly: ["Q140131057"] };

const region = (externalId: string, name: string, over: Partial<RegionRecord> = {}): RegionRecord => ({ externalId, kind: "region", name, country: null, parentExternalId: null, aliases: [], ...over });
const pick = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, REGION_DECISIONS[id]])) as Record<string, RegionDecision>;

describe("REGION_DECISIONS match the approved proposal", () => {
  it("applies every proposed kind change, exclusion and parent removal", () => {
    for (const r of proposal.records) {
      const d = REGION_DECISIONS[r.id];
      if (r.proposedKind === "exclude-candidate") expect(d, r.id).toMatchObject({ exclude: true });
      else if (r.proposedKind !== r.currentKind) expect(d?.kind, r.id).toBe(r.proposedKind);
      else expect(d?.kind, r.id).toBeUndefined();
      if (r.parentAction.startsWith("remove") && r.proposedKind !== "exclude-candidate") expect(d?.parent, r.id).toBeNull();
    }
  });

  it("adds only the documented extra decisions", () => {
    const extras = Object.keys(REGION_DECISIONS).filter((id) => !proposed.has(id)).sort();
    expect(extras).toEqual([...EXTRA.twins].sort());
    for (const id of EXTRA.twins) expect(REGION_DECISIONS[id]).toMatchObject({ kind: "appellation" });
    for (const id of EXTRA.parentCleared) expect(REGION_DECISIONS[id]?.parent, id).toBeNull();
    expect(REGION_DECISIONS.Q140131057).toMatchObject({ removeAliases: ["Trentino"] });
    expect(REGION_DECISIONS.Q140131057.kind).toBeUndefined();
    expect(REGION_DECISIONS.Q1094448).toMatchObject({ kind: "appellation", removeAliases: ["Região Demarcada do Douro"] });
  });

  it("has the expected totals and a reason for every decision", () => {
    const all = Object.values(REGION_DECISIONS);
    expect(all.filter((d) => d.kind === "appellation")).toHaveLength(113); // 110 proposed + 3 Italian twins
    expect(all.filter((d) => d.kind === "subregion")).toHaveLength(2);
    expect(all.filter((d) => d.exclude)).toHaveLength(2);
    expect(all.filter((d) => d.parent === null)).toHaveLength(7);
    for (const [id, d] of Object.entries(REGION_DECISIONS)) expect(d.reason.length, id).toBeGreaterThan(5);
  });

  it("leaves no designation-bearing name as a region or subregion once applied to the proposal's records", () => {
    const records = [...proposal.records.map((r) => region(r.id, r.name, { parentExternalId: r.parent })), region("Q140131443", "Bivongi"), region("Q140131124", "Friuli Annia"), region("Q140131139", "Colli Piacentini")];
    const { regions } = applyRegionDecisions(records);
    const wrong = regions.filter((r) => (r.kind === "region" || r.kind === "subregion") && namesDesignation(r.name));
    expect(wrong.map((r) => r.name)).toEqual([]);
  });
});

describe("applyRegionDecisions", () => {
  it("changes only the listed records and never infers a kind from the name", () => {
    const input = [region("Q1", "Margaux AOC"), region("Q2", "Mosel"), region("Q3", "Douro (DOC)", { aliases: ["Douro DOC"] })];
    const { regions, changed } = applyRegionDecisions(input, { Q3: { kind: "appellation", reason: "test" } });
    expect(regions.map((r) => [r.externalId, r.kind])).toEqual([["Q1", "region"], ["Q2", "region"], ["Q3", "appellation"]]);
    expect(changed).toBe(1);
    expect(regions[2].aliases).toEqual(["Douro DOC"]);
    expect(input[2].kind).toBe("region"); // input untouched
  });

  it("fails when a decision names an id that isn't in the snapshot", () => {
    expect(() => applyRegionDecisions([region("Q1", "A")], { Q1: { kind: "appellation", reason: "x" }, Q9: { kind: "appellation", reason: "y" } })).toThrow(/missing from this snapshot: Q9/);
    expect(() => applyRegionDecisions([region("Q1", "A")])).toThrow(/missing from this snapshot/); // the real decisions on a tiny snapshot
  });

  it("excludes records, reporting them, and clears parents that pointed at them", () => {
    const { regions, excluded, parentsCleared } = applyRegionDecisions(
      [region("Q918446", "New Zealand wine"), region("Q117074142", "North Canterbury wine region", { parentExternalId: "Q918446" }), region("Q5", "Other", { parentExternalId: "Q918446" })],
      pick("Q918446", "Q117074142"),
    );
    expect(regions.map((r) => r.externalId)).toEqual(["Q117074142", "Q5"]);
    expect(excluded).toEqual([{ externalId: "Q918446", name: "New Zealand wine", reason: REGION_DECISIONS.Q918446.reason }]);
    expect(regions.every((r) => r.parentExternalId === null)).toBe(true);
    // North Canterbury's parent is cleared by its own decision; Q5's because the parent was excluded.
    expect(parentsCleared).toEqual([{ externalId: "Q5", parentExternalId: "Q918446", why: "excluded parent" }]);
  });

  it("breaks the RDD ↔ Port loop with the reviewed decision, and any other loop deterministically", () => {
    const loop = () => [
      region("Q140379672", "Região Demarcada do Douro (RDD)", { parentExternalId: "Q191034", aliases: ["Douro DOC", "RDD"] }),
      region("Q191034", "Port Wine", { parentExternalId: "Q140379672" }),
      region("Q1094448", "Douro (DOC)", { parentExternalId: "Q140379672", aliases: ["Douro vinhateiro", "região demarcada do douro"] }),
    ];
    const reviewed = applyRegionDecisions(loop(), pick("Q140379672", "Q191034", "Q1094448"));
    expect(reviewed.regions.map((r) => [r.externalId, r.kind, r.parentExternalId])).toEqual([
      ["Q140379672", "region", null],
      ["Q191034", "appellation", "Q140379672"],
      ["Q1094448", "appellation", "Q140379672"],
    ]);
    expect(reviewed.regions[2].aliases).toEqual(["Douro vinhateiro"]); // dropped after normalisation
    expect(reviewed.parentsCleared).toEqual([]);
    // Without decisions, the loop's lowest id loses its parent.
    const bare = applyRegionDecisions(loop(), {});
    expect(bare.parentsCleared).toEqual([{ externalId: "Q191034", parentExternalId: "Q140379672", why: "parent loop" }]);
    expect(bare.regions.find((r) => r.externalId === "Q140379672")?.parentExternalId).toBe("Q191034");
  });

  it("is idempotent", () => {
    const input = [region("Q374743", "Minho (VR)", { parentExternalId: "Q1067753" }), region("Q1067753", "Vinho Verde (DOC)")];
    const once = applyRegionDecisions(input, pick("Q374743", "Q1067753")).regions;
    const twice = applyRegionDecisions(once, pick("Q374743", "Q1067753")).regions;
    expect(twice).toEqual(once);
    expect(once.map((r) => [r.name, r.kind as RegionKind, r.parentExternalId])).toEqual([["Minho (VR)", "region", null], ["Vinho Verde (DOC)", "appellation", null]]);
  });
});
