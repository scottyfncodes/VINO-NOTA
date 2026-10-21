import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { APPELLATION_AUDIT_DISCLAIMER, APPELLATION_RULES, auditAppellations, baseName, matchDesignations, type AuditRecord } from "@/lib/domain/appellation-audit";
import { auditMarkdown, auditSnapshot, regionsFromSnapshot } from "../../scripts/catalog/audit-appellations";

const rulesFor = (text: string) => matchDesignations(text).map((m) => m.rule);
const rec = (externalId: string, name: string, aliases: string[] = []): AuditRecord => ({ externalId, name, aliases });

describe("designation rules: true positives", () => {
  it.each([
    ["Margaux AOC", ["AOC"]],
    ["Pomerol AOP", ["AOP"]],
    ["Barolo DOCG", ["DOCG"]],
    ["Vinho Verde DOC", ["DOC"]],
    ["Montepulciano d'Abruzzo DOP", ["DOP"]],
    ["Rioja DOCa", ["DOCa"]],
    ["Priorat DOQ", ["DOCa"]],
    ["Ribera del Duero DO", ["DO"]],
    ["Napa Valley AVA", ["AVA"]],
    ["Weinviertel DAC", ["DAC"]],
    ["Niagara Peninsula VQA", ["VQA"]],
    ["Stellenbosch WO", ["WO"]],
    ["Barossa Valley GI", ["GI"]],
    ["Pays d'Oc IGP", ["IGP/IGT"]],
    ["Toscana IGT", ["IGP/IGT"]],
    ["Sitia PDO", ["PDO/PGI"]],
  ])("%s → %j", (name, expected) => {
    expect(rulesFor(name)).toEqual(expected);
  });

  it("recognises full designation phrases regardless of accents, case and apostrophes", () => {
    expect(rulesFor("Appellation d’Origine Controlee Margaux")).toEqual(expect.arrayContaining(["AOC-phrase", "appellation-word"]));
    expect(rulesFor("Chianti Denominazione di Origine Controllata e Garantita")).toEqual(["IT-phrase"]);
    expect(rulesFor("Jerez Denominación de Origen")).toEqual(["ES-phrase"]);
    expect(rulesFor("Douro Denominação de Origem Controlada")).toEqual(["ES-phrase"]);
    expect(rulesFor("Willamette Valley American Viticultural Area")).toEqual(["AVA-phrase"]);
    expect(rulesFor("Kamptal Districtus Austriae Controllatus")).toEqual(["DAC-phrase"]);
    expect(rulesFor("Constantia Wine of Origin")).toEqual(["WO-phrase"]);
  });
});

describe("designation rules: ordinary place names are not flagged", () => {
  it.each([
    "Bordeaux",
    "Napa Valley",
    "Douro", // contains "do"
    "Vale do Douro", // Portuguese "do" (of)
    "Dão", // accented, close to DO
    "Doca de Alcântara", // Portuguese "doca" (dock), not DOCa
    "Doc's Creek", // a name, not DOC
    "Ava", // a place name, not AVA
    "Avalon",
    "Docklands",
    "Pays d'Oc", // the region itself, without IGP
    "Côtes du Rhône",
    "Grand Cru vineyards of Burgundy", // classification words are not designation rules
    "Wachau",
    "Mosel",
  ])("%s", (name) => {
    expect(rulesFor(name)).toEqual([]);
  });
});

describe("case variations", () => {
  it("matches unambiguous acronyms in any case", () => {
    expect(rulesFor("margaux aoc")).toEqual(["AOC"]);
    expect(rulesFor("Barolo docg")).toEqual(["DOCG"]);
    expect(rulesFor("toscana igt")).toEqual(["IGP/IGT"]);
  });
  it("requires capitals where the lower-case form is an ordinary word or name", () => {
    expect(rulesFor("Ribera del Duero do")).toEqual([]);
    expect(rulesFor("Napa Valley ava")).toEqual([]);
    expect(rulesFor("Vinho Verde doc")).toEqual([]);
    expect(rulesFor("Rioja doca")).toEqual([]);
    expect(APPELLATION_RULES.filter((r) => r.caseSensitive).map((r) => r.id).sort()).toEqual(["AVA", "DAC", "DO", "DOC", "DOCa", "DOP", "GI", "VQA", "WO"]);
  });
});

describe("boundary conditions", () => {
  it("matches at the start and end, inside brackets, after hyphens and with dotted forms", () => {
    expect(rulesFor("AOC Margaux")).toEqual(["AOC"]);
    expect(rulesFor("Margaux (AOC)")).toEqual(["AOC"]);
    expect(rulesFor("AOC-Margaux")).toEqual(["AOC"]);
    expect(rulesFor("A.O.C. Pomerol")).toEqual(["AOC"]);
    expect(rulesFor("Rioja D.O.Ca")).toEqual(["DOCa"]); // not misread as "D.O" followed by "Ca"
    expect(rulesFor("Margaux AOC.")).toEqual(["AOC"]); // sentence-final full stop
    expect(rulesFor("Ribera del Duero D.O.")).toEqual(["DO"]);
  });
  it("never matches inside a longer word or number", () => {
    expect(rulesFor("MAOC")).toEqual([]);
    expect(rulesFor("AOCs")).toEqual([]);
    expect(rulesFor("DOCG2")).toEqual([]);
    expect(rulesFor("XAVA")).toEqual([]);
    expect(rulesFor("Weinviertel-DACH")).toEqual([]);
  });
  it("treats DOCG, DOC and DO as distinct tokens", () => {
    expect(rulesFor("Barolo DOCG")).not.toContain("DOC");
    expect(rulesFor("Barolo DOCG")).not.toContain("DO");
    expect(rulesFor("Vinho Verde DOC")).not.toContain("DO");
  });
  it("handles empty input", () => {
    expect(rulesFor("")).toEqual([]);
    expect(auditAppellations([])).toMatchObject({ examined: 0, flagged: 0, percent: 0, flaggedRecords: [] });
  });
});

describe("audit report", () => {
  const records = [
    rec("Q1", "Margaux AOC"),
    rec("Q2", "Bordeaux"),
    rec("Q3", "Barolo", ["Barolo DOCG"]),
    rec("Q4", "Napa Valley AVA", ["Napa AVA"]),
  ];

  it("counts examined and flagged records, names vs aliases, and rules", () => {
    const a = auditAppellations(records);
    expect(a).toMatchObject({ examined: 4, flagged: 3, percent: 75, flaggedByName: 2, flaggedByAliasOnly: 1, disclaimer: APPELLATION_AUDIT_DISCLAIMER });
    expect(a.byRule).toMatchObject({ AOC: 1, DOCG: 1, AVA: 1, DO: 0 });
    // A record that matches the same rule twice (name and alias) still counts once for that rule.
    expect(a.flaggedRecords.find((f) => f.externalId === "Q4")!.matches).toHaveLength(2);
  });

  it("lists every flagged record with its id, name and the matched rule, field and text, sorted by name", () => {
    const a = auditAppellations(records);
    expect(a.flaggedRecords.map((f) => [f.externalId, f.name])).toEqual([["Q3", "Barolo"], ["Q1", "Margaux AOC"], ["Q4", "Napa Valley AVA"]]);
    expect(a.flaggedRecords[0].matches).toEqual([{ rule: "DOCG", field: "alias", text: "Barolo DOCG", matched: "DOCG" }]);
  });

  it("does not change its input", () => {
    const copy = JSON.parse(JSON.stringify(records));
    auditAppellations(records);
    expect(records).toEqual(copy);
  });

  it("rounds the percentage to one decimal", () => {
    expect(auditAppellations([rec("Q1", "Margaux AOC"), rec("Q2", "a"), rec("Q3", "b")]).percent).toBe(33.3);
  });

  it("labels the result as a heuristic in the markdown", () => {
    const md = auditMarkdown(auditAppellations(records));
    expect(md).toContain("report only");
    expect(md).toContain("does not establish the item's classification");
    expect(md).toContain("**3 of 4 regions flagged (75%)**");
    expect(md).toContain("| Q3 | Barolo | DOCG (alias: “Barolo DOCG”) |");
  });
});

describe("review hints", () => {
  // Shapes taken from the first real snapshot audit (Wikidata, 516 regions).
  const records = [
    rec("Q1094448", "Douro (DOC)", ["Douro DOC"]),
    rec("Q140379672", "Região Demarcada do Douro (RDD)", ["Douro"]),
    rec("Q2879982", "Arrábida (IPR)", ["Bairrada (DOC)"]),
    rec("Q2879983", "Bairrada (DOC)"),
    rec("Q131278789", "Category:Aylés (DO)"),
    rec("Q322801", "Abona", ["Denominación de Origen Abona"]),
    rec("Q1019358", "Béarn AOC"),
  ];
  const audit = auditAppellations(records);
  const hints = (id: string) => audit.flaggedRecords.find((f) => f.externalId === id)!.review;

  it("strips only the matched designation to get the base name", () => {
    expect(baseName("Douro (DOC)", matchDesignations("Douro (DOC)"))).toBe("Douro");
    expect(baseName("Béarn AOC", matchDesignations("Béarn AOC"))).toBe("Béarn");
    expect(baseName("Abona", [])).toBe("Abona");
    expect(baseName("AOC", [{ matched: "AOC" }])).toBe("AOC"); // never empty
  });

  it("groups by where the designation was found", () => {
    expect(hints("Q1094448").group).toBe("designation-in-name");
    expect(hints("Q322801").group).toBe("alias-only");
    expect(hints("Q2879982").group).toBe("alias-only");
  });

  it("points at possible duplicate concepts and alias mix-ups without deciding them", () => {
    expect(hints("Q1094448")).toMatchObject({ baseName: "Douro", sameBaseAs: ["Q140379672"], aliasNamesOf: [] });
    expect(hints("Q2879982")).toMatchObject({ sameBaseAs: [], aliasNamesOf: ["Q2879983"] });
    expect(hints("Q1019358")).toMatchObject({ baseName: "Béarn", sameBaseAs: [], aliasNamesOf: [] });
    // Its own alias never counts as a duplicate of itself.
    expect(hints("Q2879983").aliasNamesOf).toEqual([]);
  });

  it("marks Wikimedia namespace pages and counts every hint", () => {
    expect(hints("Q131278789").namespacePage).toBe(true);
    expect(hints("Q1094448").namespacePage).toBe(false);
    expect(audit.review).toEqual({ possibleDuplicates: 1, aliasConflicts: 1, namespacePages: 1 });
  });

  it("shows the hints in the markdown", () => {
    const md = auditMarkdown(audit);
    expect(md).toContain("1 possible duplicate concepts, 1 possible alias mix-ups, 1 Wikimedia namespace pages");
    expect(md).toContain("designation-in-name; same base name “Douro” as Q140379672");
    expect(md).toContain("alias-only; alias is the name of Q2879983");
    expect(md).toContain("designation-in-name; namespace page");
  });
});

describe("snapshot audit script", () => {
  const wd = (id: string) => ({ type: "uri", value: `http://www.wikidata.org/entity/${id}` });
  const lit = (value: string) => ({ type: "literal", value });

  it("reads regions.json through the import's parser, skipping unlabelled items, and leaves the file unchanged", () => {
    const dir = mkdtempSync(join(os.tmpdir(), "audit-"));
    const regions = {
      head: { vars: [] },
      results: {
        bindings: [
          { item: wd("Q10"), itemLabel: lit("Margaux AOC"), iso: lit("FR") },
          { item: wd("Q11"), itemLabel: lit("Rioja"), alts: lit("Rioja DOCa|La Rioja") },
          { item: wd("Q12"), itemLabel: lit("Q12") }, // no English label: the import skips it, so does the audit
        ],
      },
    };
    const raw = JSON.stringify(regions);
    writeFileSync(join(dir, "regions.json"), raw);
    const records = regionsFromSnapshot(dir);
    // This snapshot predates class evidence, so classes are null (not an empty list).
    expect(records).toEqual([
      { externalId: "Q10", name: "Margaux AOC", aliases: [], classes: null },
      { externalId: "Q11", name: "Rioja", aliases: ["Rioja DOCa", "La Rioja"], classes: null },
    ]);
    expect(auditAppellations(records)).toMatchObject({ examined: 2, flagged: 2 });
    expect(readFileSync(join(dir, "regions.json"), "utf8")).toBe(raw);
  });

  it("has no path to a database, the network or catalog writes", () => {
    const src = readFileSync("scripts/catalog/audit-appellations.ts", "utf8");
    expect(src).not.toMatch(/server\/db|reference\/import|reference\/lookup|DATABASE_URL|fetch\(|sparql|importCatalogBatch/);
    const domain = readFileSync("src/lib/domain/appellation-audit.ts", "utf8");
    expect(domain).not.toMatch(/import .* from "(?!\.\/(normalize|catalog)")/);
  });

  it("runs in the ingest workflow after the fetch and before any database step, writing into the artifact", () => {
    const wf = readFileSync(".github/workflows/catalog-ingest.yml", "utf8");
    const audit = wf.indexOf("catalog:audit-appellations");
    expect(audit).toBeGreaterThan(wf.indexOf("catalog:fetch-wikidata"));
    expect(audit).toBeLessThan(wf.indexOf("db:migrate"));
    expect(wf).toContain('--report "$SNAPSHOT/report-appellation-audit.json"');
    // Still manual-only and Preview import still opt-in.
    expect(wf).not.toMatch(/^\s+(push|schedule|pull_request):/m);
    expect(wf).toMatch(/import_to_preview:\n(?:.*\n){2}\s+default: false/);
  });
});

describe("Wikidata class evidence in the audit", () => {
  const BASE = "Q2140699";
  const wineRegion = { id: BASE, label: "wine-producing region" };
  const aoc = { id: "Q1234", label: "appellation d'origine contrôlée" };
  const docg = { id: "Q5678", label: "DOCG" };
  const withClasses = (r: AuditRecord, classes: AuditRecord["classes"]): AuditRecord => ({ ...r, classes });
  const records = [
    withClasses(rec("Q532734", "Margaux AOC"), [wineRegion, aoc]),
    withClasses(rec("Q1019358", "Béarn AOC"), [wineRegion]),
    withClasses(rec("Q1", "Barolo"), [wineRegion, docg]), // not flagged by name, but has another class
    withClasses(rec("Q2", "Mosel"), [wineRegion]),
    withClasses(rec("Q3", "Fitou AOC"), []), // the record came back without classes
  ];
  const audit = auditAppellations(records, undefined, { baseClassId: BASE });
  const flagged = (id: string) => audit.flaggedRecords.find((f) => f.externalId === id)!;

  it("keeps each flagged record's classes and says what they need, without mapping any class to a kind", () => {
    expect(flagged("Q532734")).toMatchObject({ classes: [wineRegion, aoc], review: { classReview: "other-classes" } });
    expect(flagged("Q1019358")).toMatchObject({ classes: [wineRegion], review: { classReview: "base-class-only" } });
    expect(flagged("Q3")).toMatchObject({ classes: [], review: { classReview: "no-class-data" } });
    expect(JSON.stringify(audit)).not.toMatch(/"kind"/);
  });

  it("summarises every class and lists unflagged records with other classes for review", () => {
    expect(audit.classEvidence).toEqual({
      available: true,
      baseClassId: BASE,
      recordsWithOtherClasses: 2,
      byClass: [
        { ...wineRegion, records: 4, flagged: 2 },
        { ...aoc, records: 1, flagged: 1 },
        { ...docg, records: 1, flagged: 0 },
      ],
      unflaggedWithOtherClasses: [{ externalId: "Q1", name: "Barolo", classes: [wineRegion, docg] }],
    });
  });

  it("is deterministic regardless of record order", () => {
    expect(auditAppellations([...records].reverse(), undefined, { baseClassId: BASE })).toEqual(audit);
  });

  it("reports when the snapshot carries no class evidence", () => {
    const old = auditAppellations([rec("Q532734", "Margaux AOC"), rec("Q2", "Mosel")], undefined, { baseClassId: BASE });
    expect(old.classEvidence).toMatchObject({ available: false, recordsWithOtherClasses: 0, byClass: [], unflaggedWithOtherClasses: [] });
    expect(old.flaggedRecords[0]).toMatchObject({ classes: null, review: { classReview: "no-class-data" } });
    const md = auditMarkdown(old);
    expect(md).toContain("| Q532734 | Margaux AOC | AOC (name: “Margaux AOC”) | (no class data) |");
    expect(md).toContain("Not in this snapshot (fetched before class evidence was recorded)");
  });

  it("shows the classes next to the heuristic in the markdown, marking records to review", () => {
    const md = auditMarkdown(audit);
    expect(md).toContain("| Wikidata ID | Name | Matched rules (field: text) | Wikidata classes (P31) | Review |");
    expect(md).toContain("| Q532734 | Margaux AOC | AOC (name: “Margaux AOC”) | REVIEW: Q2140699 wine-producing region, Q1234 appellation d'origine contrôlée |");
    expect(md).toContain("| Q1019358 | Béarn AOC | AOC (name: “Béarn AOC”) | Q2140699 wine-producing region |");
    expect(md).toContain("2 of 5 regions have classes beyond Q2140699; 1 of them were not flagged by name.");
    expect(md).toContain("| Q5678 | DOCG | 1 | 0 |");
    expect(md).toContain("| Q1 | Barolo | Q2140699 wine-producing region, Q5678 DOCG |");
    expect(md).toContain("no class is mapped to a kind");
  });

  it("reads classes from a new snapshot through the same parser, treating the fetched class as the base", () => {
    const dir = mkdtempSync(join(os.tmpdir(), "audit-classes-"));
    const lit = (value: string) => ({ type: "literal", value });
    const wd = (id: string) => ({ type: "uri", value: `http://www.wikidata.org/entity/${id}` });
    const regions = {
      head: { vars: ["item", "itemLabel", "alts", "classes"] },
      results: {
        bindings: [
          { item: wd("Q532734"), itemLabel: lit("Margaux AOC"), classes: lit("Q2140699=wine-producing region|Q1234=appellation d'origine contrôlée") },
          { item: wd("Q2"), itemLabel: lit("Mosel"), classes: lit("Q2140699=wine-producing region") },
        ],
      },
    };
    writeFileSync(join(dir, "regions.json"), JSON.stringify(regions));
    expect(regionsFromSnapshot(dir)[0].classes).toEqual([aoc, wineRegion]); // sorted by numeric id
    const a = auditSnapshot(dir);
    expect(a.classEvidence).toMatchObject({ available: true, baseClassId: BASE, recordsWithOtherClasses: 1 });
    expect(a.flaggedRecords[0].review.classReview).toBe("other-classes");
  });
});
