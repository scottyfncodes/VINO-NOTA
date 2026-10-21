import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { namesDesignation } from "@/lib/domain/place";

/**
 * The Fix 3 classification proposal (docs/catalog-classification-proposal.*)
 * is reviewable data, not applied anywhere. These tests keep it complete and
 * internally consistent until it is approved; the it.todo cases are the rules
 * the eventual implementation must satisfy.
 */
type ProposalRecord = {
  id: string;
  name: string;
  set: "flagged" | "unflagged";
  group: string;
  parent: string | null;
  currentKind: string;
  proposedKind: string;
  parentAction: string;
  confidence: string;
  basis: string;
  status: string;
  classSignals: string[];
  questions: string[];
};
const proposal = JSON.parse(readFileSync("docs/catalog-classification-proposal.json", "utf8")) as {
  status: string;
  evidenceRun: string;
  questions: Record<string, string>;
  groups: Record<string, unknown>;
  records: ProposalRecord[];
};
const records = proposal.records;
const byId = new Map(records.map((r) => [r.id, r]));

describe("classification proposal: completeness", () => {
  it("covers all 101 flagged and 67 unflagged-with-classes records from evidence run 39538719311, once each", () => {
    expect(proposal.evidenceRun).toBe("39538719311");
    expect(records).toHaveLength(168);
    expect(byId.size).toBe(168);
    expect(records.filter((r) => r.set === "flagged")).toHaveLength(101);
    expect(records.filter((r) => r.set === "unflagged")).toHaveLength(67);
    // The two Wikimedia category items are rejected by validation, so they are not candidates.
    expect(byId.has("Q131278789") || byId.has("Q131278782")).toBe(false);
  });

  it("uses only known kinds, confidences, bases, statuses and parent actions", () => {
    for (const r of records) {
      expect(r.currentKind).toBe("region");
      expect(["appellation", "region", "subregion", "exclude-candidate"]).toContain(r.proposedKind);
      expect(["high", "medium", "low"]).toContain(r.confidence);
      expect(["evidence", "evidence+assumption", "assumption"]).toContain(r.basis);
      expect(["proposed", "needs-decision", "needs-register"]).toContain(r.status);
      expect(["keep", "remove", "remove?", "none"]).toContain(r.parentAction);
      expect(r.group in proposal.groups).toBe(true);
    }
  });

  it("asks a defined question for every record that needs a decision, and only defined questions", () => {
    for (const r of records) {
      for (const q of r.questions) expect(proposal.questions[q], `${r.id} → ${q}`).toBeTruthy();
      if (r.status === "needs-decision" || r.proposedKind === "exclude-candidate") expect(r.questions.length, r.id).toBeGreaterThan(0);
    }
    const asked = new Set(records.flatMap((r) => r.questions));
    expect([...asked].sort()).toEqual(Object.keys(proposal.questions).sort());
  });
});

describe("classification proposal: consistency", () => {
  it("never proposes a designation-bearing name as a region or subregion (matches the lookup's rule)", () => {
    const wrong = records.filter((r) => (r.proposedKind === "region" || r.proposedKind === "subregion") && namesDesignation(r.name));
    expect(wrong.map((r) => r.name)).toEqual([]);
  });

  it("only removes parent links that exist, and breaks the RDD ↔ Port loop", () => {
    for (const r of records) if (r.parentAction.startsWith("remove")) expect(r.parent, r.id).not.toBeNull();
    expect(byId.get("Q140379672")).toMatchObject({ parent: "Q191034", parentAction: "remove", proposedKind: "region" });
    expect(byId.get("Q191034")).toMatchObject({ parent: "Q140379672", parentAction: "keep", proposedKind: "appellation" });
    expect(byId.get("Q374743")).toMatchObject({ parent: "Q1067753", parentAction: "remove" }); // Minho (VR) under Vinho Verde (DOC)
    expect(byId.get("Q3430102")).toMatchObject({ parent: "Q2940449", parentAction: "remove" }); // Tejo (VR) under Cartaxo (IPR)
  });

  it("resolves the named duplicates and contradictions explicitly", () => {
    expect(byId.get("Q2879982")).toMatchObject({ proposedKind: "exclude-candidate", status: "needs-decision" }); // 'Arrábida (IPR)' with alias Bairrada (DOC)
    expect(byId.get("Q16010776")).toMatchObject({ proposedKind: "appellation", parent: "Q2864253" }); // the real Arrábida IPR, under Palmela
    expect(byId.get("Q2509282")?.proposedKind).toBe("appellation"); // Valle de la Orotava DO
    expect(byId.get("Q1290583")?.proposedKind).toBe("region"); // Orotava Valley
    for (const id of ["Q139916958", "Q16557744", "Q26260858", "Q2983286"]) expect(byId.get(id)?.status, id).toBe("needs-decision"); // Italian DOC conflicts
    for (const id of ["Q7322326", "Q7322327", "Q1384248", "Q7909361"]) expect(byId.get(id)?.questions, id).toContain("Q-ES-PGI");
  });

  it("never gives high confidence where a class contradicts the name (wine, winery)", () => {
    const contradicted = records.filter((r) => r.classSignals.includes("wine") || r.classSignals.includes("winery"));
    expect(contradicted.length).toBeGreaterThan(0);
    for (const r of contradicted) expect(r.confidence, r.id).not.toBe("high");
  });

  it("is not applied: nothing in the app or scripts reads it", () => {
    expect(proposal.status).toMatch(/^proposal/);
    const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
    for (const f of [...files("src"), ...files("scripts")]) expect(readFileSync(f, "utf8"), f).not.toContain("catalog-classification-proposal");
  });
});

describe("Fix 3 rules (to implement once the proposal is approved)", () => {
  it.todo("applies reviewed decisions only to the listed records, and fails on an id that isn't in the snapshot");
  it.todo("re-imports a kind change as an update in place: aliases untouched, nothing deleted, re-applying changes nothing");
  it.todo("removing a decision restores the Wikidata kind on the next import");
  it.todo("breaks the RDD ↔ Port parent loop deterministically, and validation reports any remaining cycle");
  it.todo("rejects an excluded record with a reason and never deletes an existing row");
  it.todo("never changes a kind from a class alone when the class contradicts the name (wine, winery)");
  it.todo("lookup: 'Valle de la Orotava' resolves to the DO without ambiguity");
  it.todo("lookup: Douro (DOC) gives region 'Região Demarcada do Douro (RDD)'; Borba gives no region and keeps Alentejo (DOC) as parent");
  it.todo("lookup: Minho (VR) is no longer offered as Vinho Verde's region");
  it.todo("fails the proposal check when a new snapshot has candidates that aren't reviewed yet");
});
