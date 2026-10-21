/**
 * Report-only heuristic: does a place's name (or alias) carry a recognised
 * wine designation such as AOC, DOCG or AVA? Used to estimate how many
 * fetched "wine-producing regions" may really be appellations.
 *
 * A match says only that the name contains a designation term. It does NOT
 * establish the item's actual classification, and every flagged record needs
 * manual review. Nothing here filters, reclassifies or changes catalog data.
 *
 * When the snapshot carries each record's Wikidata classes (P31), the audit
 * lists them as evidence next to the heuristic and points out records with
 * classes beyond the one they were fetched by, flagged or not. It never maps
 * a class to a kind: that is a separate, reviewed decision.
 */
import { isWikimediaNamespaceName } from "./catalog";
import { normalizeText } from "./normalize";

export const APPELLATION_AUDIT_DISCLAIMER =
  "Heuristic name-pattern match only. A flag means the name or an alias contains a recognised designation term; it does not establish the item's classification. Every flagged record requires manual review.";

export type AuditRule = {
  id: string;
  /** What the rule recognises, for the report. */
  description: string;
  kind: "acronym" | "phrase";
  /** acronym: a regex source matched as a whole token. phrase: plain words, matched after normalisation. */
  pattern: string;
  /** Acronyms whose lower-case form is an ordinary word or name ("do", "Doc", "Ava", "doca") must match in capitals. */
  caseSensitive?: boolean;
};

/**
 * The designation rules. Kept narrow on purpose: only designation acronyms
 * and full designation phrases, never generic place words such as "valley",
 * "côte" or "cru". Edit this list (and its tests) to change the audit.
 */
export const APPELLATION_RULES: AuditRule[] = [
  // France
  { id: "AOC", description: "Appellation d'origine contrôlée (FR, CH)", kind: "acronym", pattern: "A\\.?O\\.?C\\.?" },
  { id: "AOP", description: "Appellation d'origine protégée (FR, EU)", kind: "acronym", pattern: "A\\.?O\\.?P\\.?" },
  { id: "AOC-phrase", description: "“appellation d'origine contrôlée” / “appellation contrôlée”", kind: "phrase", pattern: "appellation d'origine contrôlée|appellation contrôlée|appellation d'origine protégée" },
  // Italy
  { id: "DOCG", description: "Denominazione di origine controllata e garantita (IT)", kind: "acronym", pattern: "D\\.?O\\.?C\\.?G\\.?" },
  { id: "DOC", description: "Denominazione di origine controllata (IT) / Denominação de origem controlada (PT)", kind: "acronym", pattern: "D\\.?O\\.?C\\.?", caseSensitive: true },
  { id: "DOP", description: "Denominazione di origine protetta / Denominação de origem protegida", kind: "acronym", pattern: "D\\.?O\\.?P\\.?", caseSensitive: true },
  { id: "IT-phrase", description: "Italian designation phrases", kind: "phrase", pattern: "denominazione di origine controllata e garantita|denominazione di origine controllata|denominazione di origine protetta" },
  // Spain and Catalonia
  { id: "DOCa", description: "Denominación de origen calificada (ES)", kind: "acronym", pattern: "DOC[aA]|D\\.O\\.C\\.?a\\.?|DOQ", caseSensitive: true },
  { id: "DO", description: "Denominación de origen (ES)", kind: "acronym", pattern: "D\\.?O\\.?", caseSensitive: true },
  { id: "ES-phrase", description: "Spanish, Catalan and Portuguese designation phrases", kind: "phrase", pattern: "denominación de origen calificada|denominación de origen|denominació d'origen qualificada|denominació d'origen|denominação de origem controlada|denominação de origem" },
  // United States
  { id: "AVA", description: "American Viticultural Area (US)", kind: "acronym", pattern: "AVA", caseSensitive: true },
  { id: "AVA-phrase", description: "“American Viticultural Area” / “viticultural area”", kind: "phrase", pattern: "american viticultural area|viticultural area" },
  // Other wine designations
  { id: "DAC", description: "Districtus Austriae Controllatus (AT)", kind: "acronym", pattern: "DAC", caseSensitive: true },
  { id: "DAC-phrase", description: "“Districtus Austriae Controllatus”", kind: "phrase", pattern: "districtus austriae controllatus" },
  { id: "VQA", description: "Vintners Quality Alliance (CA)", kind: "acronym", pattern: "VQA", caseSensitive: true },
  { id: "WO", description: "Wine of Origin (ZA)", kind: "acronym", pattern: "WO", caseSensitive: true },
  { id: "WO-phrase", description: "“Wine of Origin”", kind: "phrase", pattern: "wine of origin" },
  { id: "GI", description: "Geographical indication (AU, NZ)", kind: "acronym", pattern: "GI", caseSensitive: true },
  // Protected indications (EU and national): a designation, though not always an appellation
  { id: "IGP/IGT", description: "Indication géographique protégée / Indicazione geografica tipica", kind: "acronym", pattern: "I\\.?G\\.?[PT]\\.?" },
  { id: "PDO/PGI", description: "Protected designation of origin / geographical indication (EU)", kind: "acronym", pattern: "PDO|PGI" },
  { id: "PDO/PGI-phrase", description: "“protected designation of origin” / “protected geographical indication” / “indicazione geografica tipica”", kind: "phrase", pattern: "protected designation of origin|protected geographical indication|indicazione geografica tipica|indicação geográfica" },
  // The word itself
  { id: "appellation-word", description: "The word “appellation”", kind: "phrase", pattern: "appellation" },
];

type CompiledRule = { rule: AuditRule; test: (text: string, normalized: string) => string | null };

function compile(rule: AuditRule): CompiledRule {
  if (rule.kind === "acronym") {
    // A whole token: not preceded or followed by a letter or digit (Unicode-aware, so "Côtes" or "Dão" never
    // split), nor followed by a dot and a letter, so "D.O.Ca" is not read as "D.O" + "Ca".
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${rule.pattern})(?!\\.?[\\p{L}\\p{N}])`, rule.caseSensitive ? "u" : "iu");
    return { rule, test: (text) => text.match(re)?.[0] ?? null };
  }
  const phrases = rule.pattern.split("|").map((p) => normalizeText(p)).filter(Boolean);
  return { rule, test: (_text, normalized) => phrases.find((p) => ` ${normalized} `.includes(` ${p} `)) ?? null };
}

/** A Wikidata class (P31) a record is an instance of; label is null when the class has no English label. */
export type AuditClass = { id: string; label: string | null };
/** `classes` is null (or absent) when the snapshot predates class evidence. */
export type AuditRecord = { externalId: string; name: string; aliases: string[]; classes?: AuditClass[] | null };
export type AuditMatch = { rule: string; field: "name" | "alias"; text: string; matched: string };
/**
 * Pointers for the human reviewer, never decisions. `group` says where the
 * designation was found. `sameBaseAs` lists other records whose name or alias
 * equals this one's name with the designation removed (a possible duplicate
 * concept); `aliasNamesOf` lists other records whose name is one of this
 * record's aliases (a possible alias mix-up). `namespacePage` marks a
 * Wikimedia category or template item, which validation rejects.
 */
export type ReviewHints = { group: "designation-in-name" | "alias-only"; baseName: string; sameBaseAs: string[]; aliasNamesOf: string[]; namespacePage: boolean; classReview: ClassReview };
/**
 * What the class evidence says, for review only: `no-class-data` (snapshot
 * predates it, or the record has none), `base-class-only` (just the class it
 * was fetched by) or `other-classes` (more classes to review).
 */
export type ClassReview = "no-class-data" | "base-class-only" | "other-classes";
export type FlaggedRecord = { externalId: string; name: string; matches: AuditMatch[]; classes: AuditClass[] | null; review: ReviewHints };
export type ClassEvidence = {
  /** False when no examined record carries class data (an older snapshot). */
  available: boolean;
  /** The class the records were fetched by; not counted as an "other" class. */
  baseClassId: string | null;
  recordsWithOtherClasses: number;
  /** Every class seen, with how many examined and flagged records have it. Most common first. */
  byClass: (AuditClass & { records: number; flagged: number })[];
  /** Records the name heuristic missed that still have other classes: candidates for review too. */
  unflaggedWithOtherClasses: { externalId: string; name: string; classes: AuditClass[] }[];
};
export type AppellationAudit = {
  disclaimer: string;
  examined: number;
  flagged: number;
  /** Percentage of examined records flagged, one decimal place. */
  percent: number;
  /** Flagged on the record's own name (as opposed to only an alias). */
  flaggedByName: number;
  flaggedByAliasOnly: number;
  byRule: Record<string, number>;
  classEvidence: ClassEvidence;
  /** How many flagged records carry each review hint. */
  review: { possibleDuplicates: number; aliasConflicts: number; namespacePages: number };
  rules: { id: string; description: string }[];
  flaggedRecords: FlaggedRecord[];
};

/** Which rules a single text matches. */
export function matchDesignations(text: string, rules: AuditRule[] = APPELLATION_RULES): { rule: string; matched: string }[] {
  const normalized = normalizeText(text);
  return rules.map(compile).flatMap((c) => {
    const m = c.test(text, normalized);
    return m ? [{ rule: c.rule.id, matched: m }] : [];
  });
}

/** The name with the designation tokens it matched removed: "Douro (DOC)" → "Douro". */
export function baseName(name: string, nameMatches: { matched: string }[]): string {
  let s = name;
  for (const m of nameMatches) s = s.replace(m.matched, " ");
  return s.replace(/\(\s*\)/g, " ").replace(/\s+/g, " ").trim() || name.trim();
}

/** Audits records by name and alias. Pure and deterministic; never changes its input. */
export function auditAppellations(records: AuditRecord[], rules: AuditRule[] = APPELLATION_RULES, options: { baseClassId?: string } = {}): AppellationAudit {
  const baseClassId = options.baseClassId ?? null;
  const otherClasses = (r: AuditRecord) => (r.classes ?? []).filter((c) => c.id !== baseClassId);
  const classReview = (r: AuditRecord): ClassReview => (!r.classes?.length ? "no-class-data" : otherClasses(r).length ? "other-classes" : "base-class-only");
  const compiled = rules.map(compile);
  const check = (text: string, field: AuditMatch["field"]): AuditMatch[] => {
    const normalized = normalizeText(text);
    return compiled.flatMap((c) => {
      const m = c.test(text, normalized);
      return m ? [{ rule: c.rule.id, field, text, matched: m }] : [];
    });
  };
  const byName = new Map<string, Set<string>>();
  const byNameOrAlias = new Map<string, Set<string>>();
  const index = (map: Map<string, Set<string>>, text: string, id: string) => {
    const n = normalizeText(text);
    if (n) map.set(n, (map.get(n) ?? new Set()).add(id));
  };
  for (const r of records) {
    index(byName, r.name, r.externalId);
    index(byNameOrAlias, r.name, r.externalId);
    for (const a of r.aliases) index(byNameOrAlias, a, r.externalId);
  }
  const others = (map: Map<string, Set<string>>, texts: string[], self: string) =>
    [...new Set(texts.flatMap((t) => [...(map.get(normalizeText(t)) ?? [])]))].filter((id) => id !== self).sort();
  const byRule: Record<string, number> = Object.fromEntries(rules.map((r) => [r.id, 0]));
  const flaggedRecords: FlaggedRecord[] = [];
  let flaggedByName = 0;
  for (const r of records) {
    const matches = [...check(r.name, "name"), ...r.aliases.flatMap((a) => check(a, "alias"))];
    if (!matches.length) continue;
    const nameMatches = matches.filter((m) => m.field === "name");
    if (nameMatches.length) flaggedByName++;
    for (const id of new Set(matches.map((m) => m.rule))) byRule[id]++;
    const base = baseName(r.name, nameMatches);
    const review: ReviewHints = {
      group: nameMatches.length ? "designation-in-name" : "alias-only",
      baseName: base,
      sameBaseAs: normalizeText(base) === normalizeText(r.name) ? [] : others(byNameOrAlias, [base], r.externalId),
      aliasNamesOf: others(byName, r.aliases, r.externalId),
      namespacePage: isWikimediaNamespaceName(r.name),
      classReview: classReview(r),
    };
    flaggedRecords.push({ externalId: r.externalId, name: r.name, matches, classes: r.classes ?? null, review });
  }
  flaggedRecords.sort((a, b) => a.name.localeCompare(b.name) || a.externalId.localeCompare(b.externalId));
  const flagged = flaggedRecords.length;
  const flaggedIds = new Set(flaggedRecords.map((f) => f.externalId));
  const classCounts = new Map<string, AuditClass & { records: number; flagged: number }>();
  for (const r of records) {
    for (const c of r.classes ?? []) {
      const entry = classCounts.get(c.id) ?? { id: c.id, label: c.label, records: 0, flagged: 0 };
      entry.records++;
      if (flaggedIds.has(r.externalId)) entry.flagged++;
      classCounts.set(c.id, entry);
    }
  }
  const byNumericId = (a: { id: string }, b: { id: string }) => Number(a.id.slice(1)) - Number(b.id.slice(1));
  const classEvidence: ClassEvidence = {
    available: records.some((r) => !!r.classes?.length),
    baseClassId,
    recordsWithOtherClasses: records.filter((r) => otherClasses(r).length).length,
    byClass: [...classCounts.values()].sort((a, b) => b.records - a.records || byNumericId(a, b)),
    unflaggedWithOtherClasses: records
      .filter((r) => !flaggedIds.has(r.externalId) && otherClasses(r).length)
      .map((r) => ({ externalId: r.externalId, name: r.name, classes: r.classes! }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.externalId.localeCompare(b.externalId)),
  };
  return {
    disclaimer: APPELLATION_AUDIT_DISCLAIMER,
    examined: records.length,
    flagged,
    percent: records.length ? Math.round((flagged / records.length) * 1000) / 10 : 0,
    flaggedByName,
    flaggedByAliasOnly: flagged - flaggedByName,
    byRule,
    classEvidence,
    review: {
      possibleDuplicates: flaggedRecords.filter((f) => f.review.sameBaseAs.length).length,
      aliasConflicts: flaggedRecords.filter((f) => f.review.aliasNamesOf.length).length,
      namespacePages: flaggedRecords.filter((f) => f.review.namespacePage).length,
    },
    rules: rules.map((r) => ({ id: r.id, description: r.description })),
    flaggedRecords,
  };
}
