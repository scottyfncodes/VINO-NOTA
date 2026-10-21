/**
 * Reviewed region decisions (Fix 3): how specific Wikidata regions are
 * classified in the catalog, overriding the "wine-producing region" kind they
 * are fetched with. Approved 2026-10-21 with the recommended defaults in
 * docs/catalog-classification-proposal.md (15 questions), generated from that
 * proposal and checked against it by tests.
 *
 * Decisions are explicit data, keyed by Wikidata id. Nothing here infers a
 * kind from a name or a class at run time. They apply only when a snapshot is
 * imported (scripts/catalog/import.ts); the import still updates rows in place
 * and never deletes. An excluded record is left out of the batch, so an
 * existing row is reported as stale, not removed.
 */
import type { RegionKind, RegionRecord } from "@/lib/domain/catalog";
import { normalizeText } from "@/lib/domain/normalize";

export type RegionDecision = {
  /** The kind to store instead of "region". */
  kind?: RegionKind;
  /** null clears the record's parent link. */
  parent?: null;
  /** Leave the record out of the import (reported as excluded). */
  exclude?: true;
  /** Aliases to drop (compared after normalisation). */
  removeAliases?: string[];
  reason: string;
};

export const REGION_DECISIONS: Readonly<Record<string, RegionDecision>> = {
  Q2832671: { kind: "appellation", reason: "Portuguese DOC: label and DOC class agree" }, // Alenquer (DOC)
  Q2832668: { kind: "appellation", reason: "Portuguese DOC: label and DOC class agree" }, // Alentejo (DOC)
  Q2864234: { kind: "appellation", reason: "Portuguese DOC: label and DOC class agree" }, // Arruda (DOC)
  Q2894017: { kind: "appellation", reason: "Portuguese DOC: label and DOC class agree" }, // Beira Interior (DOC)
  Q2927430: { kind: "appellation", reason: "Portuguese DOC: label and DOC class agree" }, // Bucelas (DOC)
  Q2937990: { kind: "appellation", reason: "Portuguese DOC: label and DOC class agree" }, // Carcavelos (DOC)
  Q2982350: { kind: "appellation", reason: "Portuguese DOC: label and DOC class agree" }, // Colares (DOC)
  Q140562000: { kind: "appellation", reason: "Portuguese DOC: label and DOC class agree" }, // Do Tejo (DOC)
  Q1269612: { kind: "appellation", reason: "Portuguese DOC: label and DOC class agree" }, // Dão (DOC)
  Q3053850: { kind: "appellation", reason: "Portuguese DOC: label and DOC class agree" }, // Encostas d'Aire (DOC)
  Q3216175: { kind: "appellation", reason: "Portuguese DOC: label and DOC class agree" }, // Lagoa (DOC)
  Q3216201: { kind: "appellation", reason: "Portuguese DOC: label and DOC class agree" }, // Lagos (DOC)
  Q3264017: { kind: "appellation", reason: "Portuguese DOC: label and DOC class agree" }, // Lourinhã (DOC)
  Q281996: { kind: "appellation", reason: "Portuguese DOC: label and DOC class agree" }, // Moscatel de Setúbal (DOC)
  Q2864253: { kind: "appellation", reason: "Portuguese DOC: label and DOC class agree" }, // Palmela (DOC)
  Q3399320: { kind: "appellation", reason: "Portuguese DOC: label and DOC class agree" }, // Portimão (DOC)
  Q3516298: { kind: "appellation", reason: "Portuguese DOC: label and DOC class agree" }, // Tavira (DOC)
  Q3532486: { kind: "appellation", reason: "Portuguese DOC: label and DOC class agree" }, // Torres Vedras (DOC)
  Q3541228: { kind: "appellation", reason: "Portuguese DOC: label and DOC class agree" }, // Trás-os-Montes (DOC)
  Q3546429: { kind: "appellation", reason: "Portuguese DOC: label and DOC class agree" }, // Távora-Varosa (DOC)
  Q1067753: { kind: "appellation", reason: "Portuguese DOC: label and DOC class agree" }, // Vinho Verde (DOC)
  Q3593638: { kind: "appellation", reason: "Portuguese DOC: label and DOC class agree" }, // Óbidos (DOC)
  Q16250875: { kind: "appellation", reason: "Portuguese DOC sub-region: appellation under its parent DOC (Q-PT-SUB)" }, // Almeirim (DOC)
  Q4944340: { kind: "appellation", reason: "Portuguese DOC sub-region: appellation under its parent DOC (Q-PT-SUB)" }, // Borba (DOC)
  Q5049724: { kind: "appellation", reason: "Portuguese DOC sub-region: appellation under its parent DOC (Q-PT-SUB)" }, // Castelo Rodrigo (DOC)
  Q5070264: { kind: "appellation", reason: "Portuguese DOC sub-region: appellation under its parent DOC (Q-PT-SUB)" }, // Chamusca (DOC)
  Q2961726: { kind: "appellation", reason: "Portuguese DOC sub-region: appellation under its parent DOC (Q-PT-SUB)" }, // Chaves (DOC)
  Q5173389: { kind: "appellation", reason: "Portuguese DOC sub-region: appellation under its parent DOC (Q-PT-SUB)" }, // Coruche (DOC)
  Q5178877: { kind: "appellation", reason: "Portuguese DOC sub-region: appellation under its parent DOC (Q-PT-SUB)" }, // Cova da Beira (DOC)
  Q5595971: { kind: "appellation", reason: "Portuguese DOC sub-region: appellation under its parent DOC (Q-PT-SUB)" }, // Granja-Amareleja (DOC)
  Q6925854: { kind: "appellation", reason: "Portuguese DOC sub-region: appellation under its parent DOC (Q-PT-SUB)" }, // Moura (DOC)
  Q7195876: { kind: "appellation", reason: "Portuguese DOC sub-region: appellation under its parent DOC (Q-PT-SUB)" }, // Pinhel (DOC)
  Q7200946: { kind: "appellation", reason: "Portuguese DOC sub-region: appellation under its parent DOC (Q-PT-SUB)" }, // Planalto Mirandês (DOC)
  Q7231505: { kind: "appellation", reason: "Portuguese DOC sub-region: appellation under its parent DOC (Q-PT-SUB)" }, // Portalegre (DOC)
  Q7306190: { kind: "appellation", reason: "Portuguese DOC sub-region: appellation under its parent DOC (Q-PT-SUB)" }, // Redondo (DOC)
  Q7309570: { kind: "appellation", reason: "Portuguese DOC sub-region: appellation under its parent DOC (Q-PT-SUB)" }, // Reguengos (DOC)
  Q7420081: { kind: "appellation", reason: "Portuguese DOC sub-region: appellation under its parent DOC (Q-PT-SUB)" }, // Santarém (DOC)
  Q7818261: { kind: "appellation", reason: "Portuguese DOC sub-region: appellation under its parent DOC (Q-PT-SUB)" }, // Tomar (DOC)
  Q7912581: { kind: "appellation", reason: "Portuguese DOC sub-region: appellation under its parent DOC (Q-PT-SUB)" }, // Valpaços (DOC)
  Q7928085: { kind: "appellation", reason: "Portuguese DOC sub-region: appellation under its parent DOC (Q-PT-SUB)" }, // Vidigueira (DOC)
  Q5418766: { kind: "appellation", reason: "Portuguese DOC sub-region: appellation under its parent DOC (Q-PT-SUB)" }, // Évora (DOC)
  Q2832196: { kind: "appellation", reason: "Portuguese IPR class (Q-PT-IPR)" }, // Alcobaça (IPR)
  Q16010776: { kind: "appellation", reason: "Portuguese IPR class (Q-PT-IPR)" }, // Arrábida (IPR)
  Q4917248: { kind: "appellation", reason: "Portuguese IPR class (Q-PT-IPR)" }, // Biscoitos (IPR)
  Q2940449: { kind: "appellation", reason: "Portuguese IPR class (Q-PT-IPR)" }, // Cartaxo (IPR)
  Q3053843: { kind: "appellation", reason: "Portuguese IPR class (Q-PT-IPR)" }, // Encostas da Nave (IPR)
  Q5884018: { kind: "appellation", reason: "Portuguese IPR class (Q-PT-IPR)" }, // Graciosa (IPR)
  Q6471797: { kind: "appellation", reason: "Portuguese IPR class (Q-PT-IPR)" }, // Lafões (IPR)
  Q3382513: { kind: "appellation", reason: "Portuguese IPR class (Q-PT-IPR)" }, // Pico (IPR)
  Q17355602: { kind: "appellation", reason: "Portuguese IPR class (Q-PT-IPR)" }, // Varosa (IPR)
  Q374743: { parent: null, reason: "Portuguese VR: parent link inverted (Q-MINHO)" }, // Minho (VR)
  Q3430102: { parent: null, reason: "Portuguese VR: parent link inverted (Q-MINHO)" }, // Tejo (VR)
  Q1094448: { kind: "appellation", removeAliases: ["Região Demarcada do Douro"], reason: "Douro/Port: RDD region, DOC Douro and DOC Porto under it (Q-DOURO)" }, // Douro (DOC)
  Q191034: { kind: "appellation", reason: "Douro/Port: RDD region, DOC Douro and DOC Porto under it (Q-DOURO)" }, // Port Wine
  Q140379672: { parent: null, reason: "Douro/Port: RDD region, DOC Douro and DOC Porto under it (Q-DOURO)" }, // Região Demarcada do Douro (RDD)
  Q27697: { kind: "appellation", reason: "Madeira DOC class (Q-MADEIRA)" }, // Madeira wine (DOC)
  Q2879982: { exclude: true, reason: "Duplicate \"Arrábida (IPR)\" with alias \"Bairrada (DOC)\" (Q-ARRABIDA)" }, // Arrábida (IPR)
  Q1019358: { kind: "appellation", reason: "French label ends in AOC" }, // Béarn AOC
  Q1025147: { kind: "appellation", reason: "French label ends in AOC" }, // Cadillac AOC
  Q1090298: { kind: "appellation", reason: "French label ends in AOC" }, // Château-Chalon AOC
  Q1136597: { kind: "appellation", reason: "French label ends in AOC" }, // Coteaux de Pierrevert AOC
  Q1151005: { kind: "appellation", reason: "French label ends in AOC" }, // Côtes du Rhône AOC
  Q1151010: { kind: "appellation", reason: "French label ends in AOC" }, // Côtes du Roussillon AOC
  Q973682: { kind: "appellation", parent: null, reason: "Côtes du Ventoux: parent was Côtes du Rhône AOC (Q-VENTOUX)" }, // Côtes du Ventoux AOC
  Q1151015: { kind: "appellation", reason: "French label ends in AOC" }, // Côtes du Vivarais AOC
  Q1422135: { kind: "appellation", reason: "French label ends in AOC" }, // Côtes-du-Rhône Villages AOC
  Q470974: { kind: "appellation", reason: "French label ends in AOC" }, // Fitou AOC
  Q1150996: { kind: "appellation", reason: "French label ends in AOC" }, // Fronton AOC
  Q532734: { kind: "appellation", reason: "French label ends in AOC" }, // Margaux AOC
  Q2120260: { kind: "appellation", reason: "French label ends in AOC" }, // Maury AOC
  Q2123199: { kind: "appellation", reason: "French label ends in AOC" }, // Quincy AOC
  Q2146579: { kind: "appellation", reason: "French label ends in AOC" }, // Reuilly AOC
  Q2167339: { kind: "appellation", reason: "French label ends in AOC" }, // Rosette AOC
  Q507055: { kind: "appellation", reason: "French label ends in AOC" }, // Vinsobres AOC
  Q892806: { kind: "appellation", reason: "French alias \"<name> (AOC)\"" }, // Bonnezeaux
  Q1090927: { kind: "appellation", reason: "French alias \"<name> (AOC)\"" }, // Chenas
  Q1136603: { kind: "appellation", reason: "French alias \"<name> (AOC)\"" }, // Coteaux du Languedoc
  Q1136602: { kind: "appellation", reason: "French alias \"<name> (AOC)\"" }, // Coteaux du Loir
  Q1136606: { kind: "appellation", reason: "French alias \"<name> (AOC)\"" }, // Coteaux du Lyonnais
  Q1150937: { kind: "appellation", reason: "French alias \"<name> (AOC)\"" }, // Côte Roannaise
  Q1136598: { kind: "appellation", reason: "French alias \"<name> (AOC)\"" }, // Côteaux du Giennois
  Q1150990: { kind: "appellation", reason: "French alias \"<name> (AOC)\"" }, // Côtes de Provence
  Q1150991: { kind: "appellation", reason: "French alias \"<name> (AOC)\"" }, // Côtes du Forez
  Q1150995: { kind: "appellation", reason: "French alias \"<name> (AOC)\"" }, // Côtes du Jura wine
  Q1151017: { kind: "appellation", reason: "French alias \"<name> (AOC)\"" }, // Côtes d’Auvergne
  Q2922357: { kind: "appellation", reason: "French alias \"<name> (AOC)\"" }, // Hautes-Côtes de Beaune
  Q1683850: { kind: "appellation", reason: "French alias \"<name> (AOC)\"" }, // Jasnières
  Q3560958: { kind: "appellation", reason: "French alias \"<name> (AOC)\"" }, // Viré-Clessé
  Q1074779: { kind: "appellation", reason: "French appellation-level record" }, // Chiroubles
  Q28497141: { kind: "appellation", reason: "French appellation-level record" }, // Vaison-la-romaine wine
  Q2887617: { kind: "appellation", reason: "Spanish label carries DO/DOP/PDO" }, // Calatayud PDO
  Q2935540: { kind: "appellation", reason: "Spanish label carries DO/DOP/PDO" }, // Campo de Borja (DO)
  Q1754563: { kind: "appellation", reason: "Spanish label carries DO/DOP/PDO" }, // Priorat (DO)
  Q544423: { kind: "appellation", reason: "Spanish label carries DO/DOP/PDO" }, // Tierra del Vino de Zamora DO
  Q322801: { kind: "appellation", reason: "Spanish DO named like a region (Q-ES-DUAL)" }, // Abona
  Q624640: { kind: "appellation", reason: "Spanish DO named like a region (Q-ES-DUAL)" }, // Bierzo
  Q2832748: { kind: "appellation", reason: "Spanish DO named like a region (Q-ES-DUAL)" }, // Cariñena
  Q6746472: { kind: "appellation", reason: "Spanish DO named like a region (Q-ES-DUAL)" }, // Designation of Origin Pla de Bages (Wine Region)
  Q2167338: { kind: "appellation", reason: "Spanish DO named like a region (Q-ES-DUAL)" }, // Ribera del Duero
  Q1569384: { kind: "appellation", reason: "Spanish DO named like a region (Q-ES-DUAL)" }, // Rioja
  Q1938017: { kind: "appellation", reason: "Spanish DO named like a region (Q-ES-DUAL)" }, // Somontano
  Q2509282: { kind: "appellation", reason: "Valle de la Orotava DO (vs the valley)" }, // Valle de la Orotava
  Q7322326: { kind: "appellation", reason: "Spanish PGI (Vino de la Tierra) stored as appellation (Q-ES-PGI)" }, // Ribera del Gállego-Cinco Villas PGI
  Q7322327: { kind: "appellation", reason: "Spanish PGI (Vino de la Tierra) stored as appellation (Q-ES-PGI)" }, // Ribera del Jiloca PGI
  Q1384248: { kind: "appellation", reason: "Spanish PGI (Vino de la Tierra) stored as appellation (Q-ES-PGI)" }, // Ribera del Queiles PGI
  Q7909361: { kind: "appellation", reason: "Spanish PGI (Vino de la Tierra) stored as appellation (Q-ES-PGI)" }, // Valdejalón PGI
  Q139916958: { kind: "appellation", reason: "Italian DOC record (Q-IT-DUP)" }, // Bivongi DOC
  Q2983286: { kind: "appellation", reason: "Italian DOC record (Q-IT-DUP)" }, // Colli Piacentini
  Q26260858: { kind: "appellation", reason: "Italian DOC record (Q-IT-DUP)" }, // Colli Romagna Centrale DOC
  Q16557744: { kind: "appellation", reason: "Italian DOC record (Q-IT-DUP)" }, // Friuli Annia DOC
  Q1270756: { kind: "appellation", reason: "Swiss AOC" }, // Dézaley
  Q666244: { kind: "appellation", reason: "Swiss AOC" }, // La Côte
  Q55632668: { kind: "appellation", reason: "Austrian DAC" }, // Schilcherland DAC
  Q119953341: { kind: "subregion", reason: "Sub-area of Hawke's Bay (Q-NZ-SUB)" }, // Bridge Pa Triangle
  Q119953361: { kind: "subregion", reason: "Sub-area of Hawke's Bay (Q-NZ-SUB)" }, // Gimblett Gravels
  Q918446: { exclude: true, reason: "Country-level item, not a wine region (Q-NZ-COUNTRY)" }, // New Zealand wine
  Q121150641: { kind: "appellation", reason: "Designation-of-origin class (Q-OTHER-REG)" }, // Don Valley
  Q140131057: { removeAliases: ["Trentino"], reason: "Wrong alias" }, // Alto Adige
  Q117074142: { parent: null, reason: "q-nz-country: its parent, New Zealand wine, is removed" }, // North Canterbury wine region
  Q140131443: { kind: "appellation", reason: "Plain-named twin of the Italian DOC record; kept, as an appellation (Q-IT-DUP)" }, // Bivongi
  Q140131124: { kind: "appellation", reason: "Plain-named twin of the Italian DOC record; kept, as an appellation (Q-IT-DUP)" }, // Friuli Annia
  Q140131139: { kind: "appellation", reason: "Plain-named twin of the Italian DOC record; kept, as an appellation (Q-IT-DUP)" }, // Colli Piacentini
  Q19865: { parent: null, reason: "Italian area: parent was a UNESCO landscape (Q-UNESCO)" }, // Langhe
  Q19868: { parent: null, reason: "Italian area: parent was a UNESCO landscape (Q-UNESCO)" }, // Montferrat
};

export type AppliedRegionDecisions = {
  regions: RegionRecord[];
  /** How many records a decision changed (kind, parent or aliases). */
  changed: number;
  excluded: { externalId: string; name: string; reason: string }[];
  /** Records whose parent was cleared because it was excluded or closed a loop. */
  parentsCleared: { externalId: string; parentExternalId: string; why: "excluded parent" | "parent loop" }[];
};

/**
 * Applies reviewed decisions to a snapshot's regions. Pure and deterministic.
 * Fails when a decision names an id that isn't in the snapshot, so a changed
 * snapshot can't silently skip a reviewed decision. Afterwards, parents that
 * point at an excluded record are cleared, and any remaining parent loop is
 * broken by clearing the parent of its lowest Wikidata id.
 */
export function applyRegionDecisions(regions: RegionRecord[], decisions: Readonly<Record<string, RegionDecision>> = REGION_DECISIONS): AppliedRegionDecisions {
  const ids = new Set(regions.map((r) => r.externalId));
  const missing = Object.keys(decisions).filter((id) => !ids.has(id)).sort();
  if (missing.length) throw new Error(`Region decisions name ${missing.length} id(s) missing from this snapshot: ${missing.join(", ")}. Review src/server/reference/region-decisions.ts before importing.`);

  const excluded: AppliedRegionDecisions["excluded"] = [];
  let changed = 0;
  const kept = regions.flatMap((r) => {
    const d = decisions[r.externalId];
    if (!d) return [r];
    if (d.exclude) {
      excluded.push({ externalId: r.externalId, name: r.name, reason: d.reason });
      return [];
    }
    const drop = new Set((d.removeAliases ?? []).map(normalizeText));
    const next: RegionRecord = {
      ...r,
      kind: d.kind ?? r.kind,
      parentExternalId: d.parent === null ? null : r.parentExternalId,
      aliases: r.aliases.filter((a) => !drop.has(normalizeText(a))),
    };
    if (next.kind !== r.kind || next.parentExternalId !== r.parentExternalId || next.aliases.length !== r.aliases.length) changed++;
    return [next];
  });

  const parentsCleared: AppliedRegionDecisions["parentsCleared"] = [];
  const keptIds = new Set(kept.map((r) => r.externalId));
  const byId = new Map(kept.map((r) => [r.externalId, r]));
  for (const r of kept) {
    if (r.parentExternalId && !keptIds.has(r.parentExternalId) && excluded.some((e) => e.externalId === r.parentExternalId)) {
      parentsCleared.push({ externalId: r.externalId, parentExternalId: r.parentExternalId, why: "excluded parent" });
      byId.set(r.externalId, { ...r, parentExternalId: null });
    }
  }
  // Break loops deterministically: walk each chain; on revisiting, clear the parent of the loop's lowest id.
  const qnum = (id: string) => Number(id.replace(/\D/g, "")) || 0;
  for (const start of [...byId.keys()].sort((a, b) => qnum(a) - qnum(b))) {
    const path: string[] = [];
    let cur: string | null = start;
    while (cur && byId.has(cur) && !path.includes(cur)) {
      path.push(cur);
      cur = byId.get(cur)!.parentExternalId;
    }
    if (cur && path.includes(cur)) {
      const loop = path.slice(path.indexOf(cur));
      const victim = loop.reduce((a, b) => (qnum(a) <= qnum(b) ? a : b));
      const v = byId.get(victim)!;
      parentsCleared.push({ externalId: victim, parentExternalId: v.parentExternalId!, why: "parent loop" });
      byId.set(victim, { ...v, parentExternalId: null });
    }
  }
  return { regions: kept.map((r) => byId.get(r.externalId)!), changed, excluded, parentsCleared };
}
