/**
 * Report-only heuristic: does a place's name (or alias) carry a recognised
 * wine designation such as AOC, DOCG or AVA? Used to estimate how many
 * fetched "wine-producing regions" may really be appellations.
 *
 * A match says only that the name contains a designation term. It does NOT
 * establish the item's actual classification, and every flagged record needs
 * manual review. Nothing here filters, reclassifies or changes catalog data.
 */
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

export type AuditRecord = { externalId: string; name: string; aliases: string[] };
export type AuditMatch = { rule: string; field: "name" | "alias"; text: string; matched: string };
export type FlaggedRecord = { externalId: string; name: string; matches: AuditMatch[] };
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

/** Audits records by name and alias. Pure and deterministic; never changes its input. */
export function auditAppellations(records: AuditRecord[], rules: AuditRule[] = APPELLATION_RULES): AppellationAudit {
  const compiled = rules.map(compile);
  const check = (text: string, field: AuditMatch["field"]): AuditMatch[] => {
    const normalized = normalizeText(text);
    return compiled.flatMap((c) => {
      const m = c.test(text, normalized);
      return m ? [{ rule: c.rule.id, field, text, matched: m }] : [];
    });
  };
  const byRule: Record<string, number> = Object.fromEntries(rules.map((r) => [r.id, 0]));
  const flaggedRecords: FlaggedRecord[] = [];
  let flaggedByName = 0;
  for (const r of records) {
    const matches = [...check(r.name, "name"), ...r.aliases.flatMap((a) => check(a, "alias"))];
    if (!matches.length) continue;
    if (matches.some((m) => m.field === "name")) flaggedByName++;
    for (const id of new Set(matches.map((m) => m.rule))) byRule[id]++;
    flaggedRecords.push({ externalId: r.externalId, name: r.name, matches });
  }
  flaggedRecords.sort((a, b) => a.name.localeCompare(b.name) || a.externalId.localeCompare(b.externalId));
  const flagged = flaggedRecords.length;
  return {
    disclaimer: APPELLATION_AUDIT_DISCLAIMER,
    examined: records.length,
    flagged,
    percent: records.length ? Math.round((flagged / records.length) * 1000) / 10 : 0,
    flaggedByName,
    flaggedByAliasOnly: flagged - flaggedByName,
    byRule,
    rules: rules.map((r) => ({ id: r.id, description: r.description })),
    flaggedRecords,
  };
}
