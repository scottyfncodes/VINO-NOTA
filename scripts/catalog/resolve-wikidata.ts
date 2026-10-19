/**
 * Read-only Wikidata class-ID resolution. For each catalog class that needs an
 * id (grape variety, wine-producing region, appellation) it finds candidate
 * classes by exact English label or alias, then gathers evidence for each:
 * description, parent classes, how many items are instances of it, sample
 * instances, and which well-known wine anchors (e.g. Merlot, Margaux AOC) are
 * instances of it. A candidate is proposed only when the evidence singles it
 * out; otherwise the class is reported as ambiguous or unresolved.
 *
 *   npm run catalog:resolve-ids
 *
 * Fetches no catalog records, writes no files or databases (only the GitHub
 * step summary when run in Actions) and never changes WIKIDATA_CLASSES: a
 * human reviews the proposal and changes the ids in a separate PR.
 */
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { WIKIDATA_CLASSES } from "../../src/server/reference/wikidata";
import { defaultDeps, sparql, verifyIds, type Deps } from "./fetch-wikidata";

export type TargetKey = "grapeVariety" | "wineRegion" | "appellation";

/** Search terms (exact English label or alias) and anchors: items that must be instances of the right class. */
export const TARGETS: Record<TargetKey, { terms: string[]; anchors: string[] }> = {
  grapeVariety: {
    terms: ["grape variety", "wine grape variety", "wine grape", "grape cultivar", "cultivar of grape"],
    anchors: ["Merlot", "Chardonnay", "Riesling", "Pinot noir", "Cabernet Sauvignon", "Sauvignon blanc", "Syrah", "Tempranillo", "Nebbiolo", "Sangiovese"],
  },
  wineRegion: {
    terms: ["wine-producing region", "wine region", "wine-growing region", "winegrowing region", "viticultural region", "wine area"],
    anchors: ["Bordeaux", "Burgundy", "Champagne", "Rioja", "Mosel", "Douro", "Barossa Valley", "Napa Valley", "Rheingau", "Wachau", "Tokaj", "Stellenbosch"],
  },
  appellation: {
    terms: ["appellation", "wine appellation", "appellation d'origine contrôlée", "protected designation of origin", "American Viticultural Area", "Denominazione di origine controllata e garantita", "Denominación de Origen"],
    anchors: ["Margaux AOC", "Pauillac AOC", "Pomerol AOC", "Saint-Émilion AOC", "Chablis AOC", "Sancerre AOC", "Châteauneuf-du-Pape AOC", "Napa Valley AVA", "Sonoma Coast AVA", "Barolo DOCG", "Brunello di Montalcino DOCG"],
  },
};

/**
 * A candidate needs at least this many anchors and instances to be proposed,
 * and must cover this share of the target's anchors: a class that only fits a
 * narrow subset (e.g. US-only AVAs among world appellations) is not proposed.
 */
export const MIN_ANCHORS = 2;
export const MIN_INSTANCES = 10;
export const MIN_ANCHOR_SHARE = 0.4;
export const requiredAnchors = (key: TargetKey) => Math.max(MIN_ANCHORS, Math.ceil(TARGETS[key].anchors.length * MIN_ANCHOR_SHARE));
const MAX_CANDIDATES = 15;
const PAUSE_MS = 2_000;

export type Candidate = {
  id: string;
  label: string;
  description: string | null;
  matchedTerms: string[];
  instances: number;
  parents: string[];
  anchorsHit: string[];
  sampleInstances: string[];
};
/** A class the anchors themselves are instances of (P31): where the right class may lie when no candidate qualifies. */
export type AnchorClass = { id: string; label: string; anchors: string[] };
export type Resolution = {
  key: TargetKey;
  status: "resolved" | "ambiguous" | "unresolved";
  proposed: Candidate | null;
  reason: string;
  candidates: Candidate[];
  anchorClasses?: AnchorClass[];
};

const lit = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"@en`;
const qid = (uri: string) => uri.split("/").pop()!;
const values = (ids: string[]) => ids.map((id) => `wd:${id}`).join(" ");

export const resolutionQueries = {
  candidates: (terms: string[]) => `SELECT DISTINCT ?item ?itemLabel ?desc ?matched WHERE {
  VALUES ?matched { ${terms.map(lit).join(" ")} }
  { ?item rdfs:label ?matched } UNION { ?item skos:altLabel ?matched }
  ?item rdfs:label ?itemLabel FILTER(LANG(?itemLabel) = "en")
  OPTIONAL { ?item schema:description ?desc FILTER(LANG(?desc) = "en") }
} LIMIT 100`,
  instanceCounts: (ids: string[]) => `SELECT ?item (COUNT(DISTINCT ?inst) AS ?instances) WHERE {
  VALUES ?item { ${values(ids)} }
  OPTIONAL { ?inst wdt:P31 ?item }
} GROUP BY ?item`,
  parents: (ids: string[]) => `SELECT ?item ?parentLabel WHERE {
  VALUES ?item { ${values(ids)} }
  ?item wdt:P279 ?parent . ?parent rdfs:label ?parentLabel FILTER(LANG(?parentLabel) = "en")
}`,
  anchors: (ids: string[], anchors: string[]) => `SELECT DISTINCT ?item ?anchor WHERE {
  VALUES ?item { ${values(ids)} }
  VALUES ?anchor { ${anchors.map(lit).join(" ")} }
  ?a rdfs:label ?anchor . ?a wdt:P31/wdt:P279* ?item
}`,
  anchorClasses: (anchors: string[]) => `SELECT DISTINCT ?anchor ?class ?classLabel WHERE {
  VALUES ?anchor { ${anchors.map(lit).join(" ")} }
  ?a rdfs:label ?anchor . ?a wdt:P31 ?class . ?class rdfs:label ?classLabel FILTER(LANG(?classLabel) = "en")
} LIMIT 500`,
  samples: (ids: string[]) => `SELECT ?item ?instLabel WHERE {
  VALUES ?item { ${values(ids)} }
  ?inst wdt:P31 ?item . ?inst rdfs:label ?instLabel FILTER(LANG(?instLabel) = "en")
} LIMIT 300`,
};

/**
 * Picks the class the evidence singles out. Pure and deterministic.
 * resolved: exactly one candidate meets every threshold.
 * ambiguous: several do (none is proposed).
 * unresolved: none do.
 */
export function evaluateCandidates(key: TargetKey, candidates: Candidate[]): Resolution {
  const need = requiredAnchors(key);
  const total = TARGETS[key].anchors.length;
  const ranked = [...candidates].sort((a, b) => b.anchorsHit.length - a.anchorsHit.length || b.instances - a.instances || a.id.localeCompare(b.id));
  const qualified = ranked.filter((c) => c.anchorsHit.length >= need && c.instances >= MIN_INSTANCES);
  if (!candidates.length) return { key, status: "unresolved", proposed: null, reason: "no Wikidata item has one of the search terms as its English label or alias", candidates: ranked };
  if (!qualified.length) {
    const best = ranked[0];
    return {
      key,
      status: "unresolved",
      proposed: null,
      reason: `no candidate is an ancestor class of at least ${need} of the ${total} anchors with ${MIN_INSTANCES}+ instances (best: ${best.id} "${best.label}", ${best.anchorsHit.length}/${total} anchors)`,
      candidates: ranked,
    };
  }
  if (qualified.length > 1) {
    return { key, status: "ambiguous", proposed: null, reason: `${qualified.length} candidates meet the thresholds (${qualified.map((c) => c.id).join(", ")}); needs a human decision`, candidates: ranked };
  }
  const c = qualified[0];
  return { key, status: "resolved", proposed: c, reason: `only candidate covering ≥${need} of ${total} anchors (${c.anchorsHit.length}) with ≥${MIN_INSTANCES} instances (${c.instances})`, candidates: ranked };
}

/** The classes each anchor is directly an instance of, most widely shared first. */
export async function gatherAnchorClasses(key: TargetKey, deps: Deps = defaultDeps): Promise<AnchorClass[]> {
  const byClass = new Map<string, AnchorClass>();
  for (const b of (await sparql(resolutionQueries.anchorClasses(TARGETS[key].anchors), deps)).results.bindings) {
    const id = qid(b.class.value);
    const c = byClass.get(id) ?? { id, label: b.classLabel.value, anchors: [] };
    if (!c.anchors.includes(b.anchor.value)) c.anchors.push(b.anchor.value);
    byClass.set(id, c);
  }
  return [...byClass.values()].sort((a, b) => b.anchors.length - a.anchors.length || a.id.localeCompare(b.id));
}

export async function gatherCandidates(key: TargetKey, deps: Deps = defaultDeps): Promise<Candidate[]> {
  const t = TARGETS[key];
  const found = new Map<string, Candidate>();
  for (const b of (await sparql(resolutionQueries.candidates(t.terms), deps)).results.bindings) {
    const id = qid(b.item.value);
    const c = found.get(id) ?? { id, label: b.itemLabel.value, description: b.desc?.value ?? null, matchedTerms: [], instances: 0, parents: [], anchorsHit: [], sampleInstances: [] };
    if (!c.matchedTerms.includes(b.matched.value)) c.matchedTerms.push(b.matched.value);
    found.set(id, c);
  }
  const all = [...found.values()];
  if (!all.length) return [];
  // An exact English label match ranks ahead of an alias match when trimming.
  const candidates = all.sort((a, b) => Number(t.terms.includes(b.label)) - Number(t.terms.includes(a.label))).slice(0, MAX_CANDIDATES);
  const ids = candidates.map((c) => c.id);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const step = async (query: string, apply: (b: Record<string, { value: string }>) => void) => {
    await deps.sleep(PAUSE_MS);
    for (const b of (await sparql(query, deps)).results.bindings) apply(b);
  };
  await step(resolutionQueries.instanceCounts(ids), (b) => {
    byId.get(qid(b.item.value))!.instances = Number(b.instances.value);
  });
  await step(resolutionQueries.parents(ids), (b) => {
    byId.get(qid(b.item.value))!.parents.push(b.parentLabel.value);
  });
  await step(resolutionQueries.anchors(ids, t.anchors), (b) => {
    const c = byId.get(qid(b.item.value))!;
    if (!c.anchorsHit.includes(b.anchor.value)) c.anchorsHit.push(b.anchor.value);
  });
  await step(resolutionQueries.samples(ids), (b) => {
    const c = byId.get(qid(b.item.value))!;
    if (c.sampleInstances.length < 8) c.sampleInstances.push(b.instLabel.value);
  });
  return candidates;
}

export async function resolveClassIds(deps: Deps = defaultDeps) {
  // The configured ids, checked exactly as the ingest workflow checks them.
  let configured: string;
  try {
    await verifyIds(deps);
    configured = "all configured ids match their expected labels";
  } catch (e) {
    configured = e instanceof Error ? e.message : String(e);
  }
  const results: Resolution[] = [];
  for (const key of Object.keys(TARGETS) as TargetKey[]) {
    await deps.sleep(PAUSE_MS);
    const resolution = evaluateCandidates(key, await gatherCandidates(key, deps));
    // When nothing is proposed, show which classes the anchors really belong to.
    if (resolution.status !== "resolved") {
      await deps.sleep(PAUSE_MS);
      resolution.anchorClasses = await gatherAnchorClasses(key, deps);
    }
    results.push(resolution);
  }
  return { configured, results };
}

export function formatReport(r: Awaited<ReturnType<typeof resolveClassIds>>) {
  const lines = [`## Wikidata class-ID resolution (read-only)`, ``, `**Configured ids:** ${r.configured}`, ``];
  for (const res of r.results) {
    const current = (WIKIDATA_CLASSES as Record<string, { id: string; expectLabel: string } | undefined>)[res.key];
    const configured = current ? `Configured: ${current.id} (expected "${current.expectLabel}").` : "Not configured (excluded from ingestion).";
    lines.push(`### ${res.key} — ${res.status.toUpperCase()}`, ``, `${configured} ${res.proposed ? `**Proposed: ${res.proposed.id} "${res.proposed.label}"**` : "**No id proposed.**"} ${res.reason}.`, ``);
    lines.push(`| Q-ID | Label | Description | Matched | Instances | Anchors (${TARGETS[res.key].anchors.length}) | Parent classes | Sample instances |`, `|---|---|---|---|---|---|---|---|`);
    for (const c of res.candidates) {
      const cell = (s: string) => s.replace(/\|/g, "\\|");
      lines.push(`| ${c.id} | ${cell(c.label)} | ${cell(c.description ?? "")} | ${cell(c.matchedTerms.join("; "))} | ${c.instances} | ${c.anchorsHit.length}: ${cell(c.anchorsHit.join(", "))} | ${cell(c.parents.join(", "))} | ${cell(c.sampleInstances.join(", "))} |`);
    }
    if (!res.candidates.length) lines.push(`| — | | | | | | | |`);
    if (res.anchorClasses) {
      lines.push(``, `Classes the anchors are directly instances of (P31):`, ``, `| Q-ID | Label | Anchors |`, `|---|---|---|`);
      for (const c of res.anchorClasses) lines.push(`| ${c.id} | ${c.label.replace(/\|/g, "\\|")} | ${c.anchors.length}: ${c.anchors.join(", ")} |`);
    }
    lines.push(``);
  }
  return lines.join("\n");
}

async function main() {
  const report = await resolveClassIds();
  const text = formatReport(report);
  console.log(text);
  console.log(JSON.stringify(report, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("[wikidata:resolve] Failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
