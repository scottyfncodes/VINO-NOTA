# Fix 3: region classification proposal

Status: **approved on 2026-10-21 with the recommended defaults** (listed under "Decisions needed").

- **Where it lives:** the decisions are implemented as reviewed data in `src/server/reference/region-decisions.ts`, which tests check against this proposal.
- **When it takes effect:** only on the next import. Until then, no catalog data in `catalog-preview` or Production has changed.
- **This file is not read by the app.** `catalog-classification-proposal.json` is a record of the review.

Sources:
- **Class evidence:** run [39538719311](https://github.com/scottyfncodes/VINO-NOTA/actions/runs/39538719311) on `main` at `e813598` (artifact `wikidata-snapshot-39538719311`).
- **Country and parent links:** `catalog-preview`, read-only (snapshot run 39534929327, the same 514 records).

Every row says whether its conclusion rests on **evidence** (the Wikidata label, aliases, classes or links), on **evidence plus an assumption** (domain knowledge, stated in the row or group), or on an assumption alone.

## Summary

| | Count |
|---|---:|
| Candidates | 168 (101 flagged + 67 unflagged with other classes) |
| Proposed appellation | 110 |
| Stay region | 54 |
| Proposed subregion | 2 |
| Removal candidates (need your decision) | 2 |
| Status: proposed / needs your decision / needs an official register | 105 / 52 / 11 |
| Confidence: high / medium / low | 49 / 103 / 16 |

**Rules behind the proposals.** These are the rules Fix 3 would implement, as reviewed data and never inferred at run time:
1. **Name plus class:** a designation in the Wikidata label (AOC, DOC, DO, PDO, DAC…) together with a designation class (DOC, AOC, appellation, designation of origin, PDO, IPR) gives appellation, high confidence.
2. **Name only:** a designation in the label with no confirming class gives appellation, medium.
3. **Class only:** a designation class with no designation in the name gives an appellation candidate, decided per group. In Chile, DO names are the official regions, so they stay regions.
4. **Region classes:** "geographical indication" (New Zealand) and "Vinho Regional" (Portugal) mean the record stays a region.
5. **Contradictions:** a class of "wine" or "winery" on an appellation-named record is a Wikidata error. It's flagged; the kind still follows rules 1 to 3.
6. **Unknown or geographic classes** (valley, town, landscape, trademark…) leave the record unchanged.
7. **Hierarchy:** parent links are kept unless they form a loop or invert breadth, e.g. a VR under a DOC. Only those links are proposed for removal.

## Decisions needed (approved defaults in bold)

- **Q-PT-SUB** (19 records): Portuguese DOC sub-regions (19, e.g. Borba under Alentejo): model them as appellations with their parent DOC (recommended), or as subregions? **Approved: appellation, keeping the parent DOC.**
- **Q-PT-IPR** (9 records): Portuguese IPRs (9): accept them as appellations now, or wait for an IVV register check of which are still IPRs and which were promoted or merged? **Approved: appellation now (the kind is the same either way); register check later.**
- **Q-DOURO** (4 records): Douro/Port: approve RDD as a region with no parent (breaking the RDD↔Port loop), Douro (DOC) and Port Wine as appellations under it, and dropping the 'Região Demarcada do Douro' alias from Douro (DOC)? **Approved: RDD region with no parent; Douro (DOC) and Port Wine appellations under it; alias 'Região Demarcada do Douro' dropped from Douro (DOC).**
- **Q-MADEIRA** (1 record): Madeira wine (DOC): keep as the Madeira DOC appellation, or drop it because the item describes the wine? **Approved: keep as the Madeira DOC appellation.**
- **Q-ARRABIDA** (1 record): Q2879982 'Arrábida (IPR)' with alias 'Bairrada (DOC)': drop it (recommended until Wikidata is checked), keep it as Arrábida, or treat it as Bairrada DOC? **Approved: exclude Q2879982 until Wikidata is checked.**
- **Q-ES-DUAL** (7 records): Spanish DOs named like regions (Rioja, Ribera del Duero, Bierzo, Cariñena, Somontano, Pla de Bages, Abona): appellation (recommended) or keep region? **Approved: appellation.**
- **Q-ES-PGI** (4 records): Spanish PGIs (4): store as appellation (recommended; the slot a label uses), or keep region? Is Ribera del Queiles a PGI (label) or a DO (class)? **Approved: appellation; Ribera del Queiles treated as a PGI (label).**
- **Q-IT-DUP** (5 records): Italian twins (Bivongi, Friuli Annia, Colli Piacentini): keep the DOC-labelled record as the appellation and drop the plain Q14013xxxx twin, or keep both? **Approved: DOC-labelled records become appellations; the plain twins are kept, also as appellations (nothing removed).**
- **Q-NZ-SUB** (2 records): Gimblett Gravels and Bridge Pa Triangle: subregion of Hawke's Bay, or keep region? **Approved: subregion of Hawke's Bay.**
- **Q-NZ-COUNTRY** (1 record): 'New Zealand wine' (country-level item): drop it and clear North Canterbury's parent? **Approved: exclude 'New Zealand wine'; clear North Canterbury's parent.**
- **Q-CL** (8 records): Chilean DOs (8): keep as regions (recommended)? Should Rapel ⊂ Valle Central and Colchagua/Cachapoal ⊂ Rapel be added, even though Wikidata has no parent links? **Approved: keep as regions; no hierarchy added.**
- **Q-OTHER-REG** (2 records): Don Valley (RU) and Nemea (GR): accept Don Valley as an appellation on its class alone, and keep Nemea a region until a register check? **Approved: Don Valley appellation; Nemea stays a region.**
- **Q-MINHO** (1 record): Minho (VR) / Vinho Verde (DOC): remove the inverted parent link (recommended)? Should Vinho Verde get Minho (VR) as a region parent? (Lookup would then offer 'Minho (VR)' as the region.) **Approved: remove Minho (VR)'s parent; no new parent for Vinho Verde.**
- **Q-VENTOUX** (1 record): Côtes du Ventoux AOC: remove its parent link to Côtes du Rhône AOC? **Approved: remove the parent link.**
- **Q-UNESCO** (1 record): Langhe and Montferrat: remove their parent link to the UNESCO landscape record? **Approved: remove Langhe's and Montferrat's parent links.**

## Exceptions and specific resolutions

- **Douro, Port and the RDD loop:** RDD (Q140379672) and Port Wine (Q191034) are each other's parent. Proposed: remove RDD's parent; Douro (DOC) and Port Wine become appellations under RDD; drop the "Região Demarcada do Douro" alias from Douro (DOC), because it's the RDD's own name. Alto Douro Wine Region (Q649738, the UNESCO landscape) stays a separate region.
- **Minho / Vinho Verde:** Minho (VR) is listed under Vinho Verde (DOC), but the VR is the broader area. Remove that link. **Tejo (VR) under Cartaxo (IPR)** is inverted the same way; remove it too.
- **Duplicate Arrábida:** Q16010776 is the real Arrábida IPR, under Palmela (DOC). Q2879982 shares the label but has the DOC class and only a "Bairrada (DOC)" alias. It's probably Bairrada DOC mislabelled, so it's proposed for removal until Wikidata is checked.
- **Valle de la Orotava:** two records of one name are why lookup marks it ambiguous today. The DO (Q2509282) becomes an appellation and the valley (Q1290583) stays a region, which removes the ambiguity.
- **Italian DOC conflicts:** Bivongi DOC, Friuli Annia DOC and Colli Romagna Centrale DOC are typed "wine", and two of them have plain-named twins (Q140131443, Q140131124). Colli Piacentini (typed "hill group") has a twin, Q140131139. Alto Adige is typed "wine" and wrongly carries a "Trentino" alias.
- **Spanish PGIs:** the labels say PGI, but Ribera del Queiles is typed "designation of origin". The schema has no PGI kind, so the proposal is appellation, pending your decision.
- **Portuguese DOC sub-regions are not modelled identically.**
  - Alentejo (8), Tejo (5) and Beira Interior/Trás-os-Montes (3 each) are DOC sub-regions. Five of them lack the DOC class (Redondo, Coruche, Castelo Rodrigo, Cova da Beira, Planalto Mirandês) and rest on name and parent.
  - IPR children (Alcobaça, Arrábida, Encostas da Nave, Cartaxo) are a different designation tier.
  - Douro and Port sit in a demarcated region (RDD) rather than under a DOC.
- **Wikidata errors, flagged and not used:** "winery" on Chenas and Côteaux du Giennois; "wine" on the Italian DOCs and Alto Adige; Recaș, Silagiu and Koelenhof are towns typed as wine regions.

## Gaps in the evidence

- **Most records have no designation class.** 77% of the 516 regions carry only "wine-producing region". Most French AOCs and Spanish DOs here rest on the label or aliases, not a class.
- **No official register was checked:** INAO, IVV, MAPA, MASAF, eAmbrosia and SAG are all unreachable from this environment. All `needs-register` rows depend on one.
- **Missing countries:** 38 of 514 regions have none, most of them Portuguese DOCs, VRs and IPRs. Deriving the country from the parent or the designation system would be an assumption. Not proposed here.
- **Parent links come from one source:** Wikidata's "part of" (P361), which is sparse (49 of 514). Missing hierarchy, e.g. Chile, is not inferred.
- **Snapshot difference:** the hierarchy comes from the earlier snapshot (39534929327). Its record set and import counts match the evidence run exactly.

## Proposed regression tests for Fix 3

These are listed as `it.todo` in `tests/unit/catalog-classification-proposal.test.ts`:
1. Applying the reviewed decisions changes only the listed records; any unknown id is an error.
2. A kind change re-imports as an update in place: aliases are untouched and nothing is deleted. Re-applying is idempotent, and removing a decision restores the Wikidata kind.
3. Parent loops are broken deterministically (RDD↔Port), and validation reports any remaining loop.
4. A removed or excluded record is rejected with a reason and never deleted from the database by the import.
5. Lookup:
   - "Valle de la Orotava" resolves to the DO without ambiguity;
   - "Margaux" gives no region;
   - Douro (DOC) gives region RDD;
   - Borba gives no region and keeps Alentejo (DOC) as its parent;
   - Minho (VR) is no longer Vinho Verde's parent.
6. Records whose classes contradict their name stay as decided by the reviewed list and are never changed by a class alone.
7. The proposal file covers exactly the audit's candidates; a new snapshot with new candidates fails the check until they're reviewed.

## Classification matrix

### Portuguese DOCs (top level): name and class agree (22)

Proposal: **appellation**. Confidence: high. Basis: evidence. Status: proposed.

Wikidata labels them '(DOC)' and they carry the 'denominação de origem controlada' class. Name and class agree.

| Wikidata ID | Name | CC | Parent | Name evidence | Other Wikidata classes | Proposed | Parent action | Conf. | Note |
|---|---|---|---|---|---|---|---|---|---|
| Q2832671 | Alenquer (DOC) | — | — | flagged: DOC (name: “Alenquer (DOC)”) | Q451752 denominação de origem controlada | appellation | none | high |  |
| Q2832668 | Alentejo (DOC) | PT | — | flagged: DOC (name: “Alentejo (DOC)”) | Q451752 denominação de origem controlada | appellation | none | high |  |
| Q2864234 | Arruda (DOC) | PT | — | flagged: DOC (name: “Arruda (DOC)”) | Q451752 denominação de origem controlada | appellation | none | high |  |
| Q2894017 | Beira Interior (DOC) | PT | — | flagged: DOC (name: “Beira Interior (DOC)”) | Q451752 denominação de origem controlada | appellation | none | high |  |
| Q2927430 | Bucelas (DOC) | — | — | flagged: DOC (name: “Bucelas (DOC)”) | Q451752 denominação de origem controlada | appellation | none | high |  |
| Q2937990 | Carcavelos (DOC) | — | — | flagged: DOC (name: “Carcavelos (DOC)”) | Q451752 denominação de origem controlada | appellation | none | high |  |
| Q2982350 | Colares (DOC) | — | — | flagged: DOC (name: “Colares (DOC)”) | Q451752 denominação de origem controlada | appellation | none | high |  |
| Q140562000 | Do Tejo (DOC) | PT | — | flagged: DOC (name: “Do Tejo (DOC)”) | Q451752 denominação de origem controlada | appellation | none | high |  |
| Q1269612 | Dão (DOC) | — | — | flagged: DOC (name: “Dão  (DOC)”) | Q451752 denominação de origem controlada | appellation | none | high |  |
| Q3053850 | Encostas d'Aire (DOC) | — | — | flagged: DOC (name: “Encostas d'Aire (DOC)”) | Q451752 denominação de origem controlada | appellation | none | high |  |
| Q3216175 | Lagoa (DOC) | — | — | flagged: DOC (name: “Lagoa (DOC)”) | Q451752 denominação de origem controlada | appellation | none | high |  |
| Q3216201 | Lagos (DOC) | — | — | flagged: DOC (name: “Lagos (DOC)”) | Q451752 denominação de origem controlada | appellation | none | high |  |
| Q3264017 | Lourinhã (DOC) | PT | — | flagged: DOC (name: “Lourinhã (DOC)”) | Q451752 denominação de origem controlada | appellation | none | high | Assumption: DOC Lourinhã covers aguardente (brandy), not wine. |
| Q281996 | Moscatel de Setúbal (DOC) | — | — | flagged: DOC (name: “Moscatel de Setúbal (DOC)”) | Q451752 denominação de origem controlada | appellation | none | high |  |
| Q2864253 | Palmela (DOC) | — | — | flagged: DOC (name: “Palmela (DOC)”) | Q451752 denominação de origem controlada | appellation | none | high |  |
| Q3399320 | Portimão (DOC) | — | — | flagged: DOC (name: “Portimão (DOC)”) | Q451752 denominação de origem controlada | appellation | none | high |  |
| Q3516298 | Tavira (DOC) | — | — | flagged: DOC (name: “Tavira  (DOC)”) | Q451752 denominação de origem controlada | appellation | none | high |  |
| Q3532486 | Torres Vedras (DOC) | — | — | flagged: DOC (name: “Torres Vedras (DOC)”) | Q451752 denominação de origem controlada | appellation | none | high |  |
| Q3541228 | Trás-os-Montes (DOC) | PT | — | flagged: DOC (name: “Trás-os-Montes (DOC)”) | Q451752 denominação de origem controlada | appellation | none | high |  |
| Q3546429 | Távora-Varosa (DOC) | — | — | flagged: DOC (name: “Távora-Varosa (DOC)”) | Q451752 denominação de origem controlada | appellation | none | high |  |
| Q1067753 | Vinho Verde (DOC) | — | — | flagged: DOC (name: “Vinho Verde (DOC)”) | Q451752 denominação de origem controlada | appellation | none | high | Currently Minho (VR)'s parent, which should be removed. |
| Q3593638 | Óbidos (DOC) | — | — | flagged: DOC (name: “Óbidos (DOC)”) | Q451752 denominação de origem controlada | appellation | none | high |  |

### Portuguese DOC sub-regions (child of a DOC) (19)

Proposal: **appellation**. Confidence: medium. Basis: evidence+assumption. Status: needs-decision; questions: Q-PT-SUB.

Named '(DOC)' and linked by Wikidata 'part of' to a parent DOC; 14 of 19 also carry the DOC class. Proposed: kind appellation, keeping the parent link, so the DOC→sub-region hierarchy survives. The alternative, kind 'subregion', would never fill anything: names with a designation are never offered as a subregion.

| Wikidata ID | Name | CC | Parent | Name evidence | Other Wikidata classes | Proposed | Parent action | Conf. | Note |
|---|---|---|---|---|---|---|---|---|---|
| Q16250875 | Almeirim (DOC) | PT | Q140562000 Do Tejo (DOC) | flagged: DOC (name: “Almeirim (DOC)”) | Q451752 denominação de origem controlada | appellation | keep | medium |  |
| Q4944340 | Borba (DOC) | PT | Q2832668 Alentejo (DOC) | flagged: DOC (name: “Borba (DOC)”) | Q451752 denominação de origem controlada | appellation | keep | medium |  |
| Q5049724 | Castelo Rodrigo (DOC) | PT | Q2894017 Beira Interior (DOC) | flagged: DOC (name: “Castelo Rodrigo (DOC)”) | — | appellation | keep | medium |  |
| Q5070264 | Chamusca (DOC) | PT | Q140562000 Do Tejo (DOC) | flagged: DOC (name: “Chamusca (DOC)”) | Q451752 denominação de origem controlada | appellation | keep | medium |  |
| Q2961726 | Chaves (DOC) | — | Q3541228 Trás-os-Montes (DOC) | flagged: DOC (name: “Chaves (DOC)”) | Q451752 denominação de origem controlada | appellation | keep | medium |  |
| Q5173389 | Coruche (DOC) | PT | Q140562000 Do Tejo (DOC) | flagged: DOC (name: “Coruche (DOC)”) | — | appellation | keep | medium |  |
| Q5178877 | Cova da Beira (DOC) | PT | Q2894017 Beira Interior (DOC) | flagged: DOC (name: “Cova da Beira (DOC)”) | — | appellation | keep | medium |  |
| Q5595971 | Granja-Amareleja (DOC) | PT | Q2832668 Alentejo (DOC) | flagged: DOC (name: “Granja-Amareleja (DOC)”) | Q451752 denominação de origem controlada | appellation | keep | medium |  |
| Q6925854 | Moura (DOC) | PT | Q2832668 Alentejo (DOC) | flagged: DOC (name: “Moura (DOC)”) | Q451752 denominação de origem controlada | appellation | keep | medium |  |
| Q7195876 | Pinhel (DOC) | PT | Q2894017 Beira Interior (DOC) | flagged: DOC (name: “Pinhel (DOC)”) | Q451752 denominação de origem controlada | appellation | keep | medium |  |
| Q7200946 | Planalto Mirandês (DOC) | PT | Q3541228 Trás-os-Montes (DOC) | flagged: DOC (name: “Planalto Mirandês (DOC)”) | — | appellation | keep | medium |  |
| Q7231505 | Portalegre (DOC) | PT | Q2832668 Alentejo (DOC) | flagged: DOC (name: “Portalegre (DOC)”) | Q451752 denominação de origem controlada | appellation | keep | medium |  |
| Q7306190 | Redondo (DOC) | PT | Q2832668 Alentejo (DOC) | flagged: DOC (name: “Redondo (DOC)”) | — | appellation | keep | medium |  |
| Q7309570 | Reguengos (DOC) | PT | Q2832668 Alentejo (DOC) | flagged: DOC (name: “Reguengos (DOC)”) | Q451752 denominação de origem controlada | appellation | keep | medium |  |
| Q7420081 | Santarém (DOC) | PT | Q140562000 Do Tejo (DOC) | flagged: DOC (name: “Santarém (DOC)”) | Q451752 denominação de origem controlada | appellation | keep | medium |  |
| Q7818261 | Tomar (DOC) | PT | Q140562000 Do Tejo (DOC) | flagged: DOC (name: “Tomar (DOC)”) | Q451752 denominação de origem controlada | appellation | keep | medium |  |
| Q7912581 | Valpaços (DOC) | PT | Q3541228 Trás-os-Montes (DOC) | flagged: DOC (name: “Valpaços (DOC)”) | Q451752 denominação de origem controlada | appellation | keep | medium |  |
| Q7928085 | Vidigueira (DOC) | PT | Q2832668 Alentejo (DOC) | flagged: DOC (name: “Vidigueira (DOC)”) | Q451752 denominação de origem controlada | appellation | keep | medium |  |
| Q5418766 | Évora (DOC) | PT | Q2832668 Alentejo (DOC) | flagged: DOC (name: “Évora (DOC)”) | Q451752 denominação de origem controlada | appellation | keep | medium |  |

### Portuguese IPRs (Indicação de Proveniência Regulamentada) (9)

Proposal: **appellation**. Confidence: medium. Basis: evidence+assumption. Status: needs-register; questions: Q-PT-IPR.

They carry the IPR class, a regulated designation of provenance. Proposed: appellation, keeping parent links to their DOC. Assumption: several IPRs have since been promoted to DOC or merged (e.g. Pico, Biscoitos, Graciosa, Lafões, Encostas da Nave, Varosa); the kind is appellation either way, but their current status needs the IVV register.

| Wikidata ID | Name | CC | Parent | Name evidence | Other Wikidata classes | Proposed | Parent action | Conf. | Note |
|---|---|---|---|---|---|---|---|---|---|
| Q2832196 | Alcobaça (IPR) | — | Q3053850 Encostas d'Aire (DOC) | — | Q13582250 Indicação de Proveniência Regulamentada | appellation | keep | medium |  |
| Q16010776 | Arrábida (IPR) | — | Q2864253 Palmela (DOC) | — | Q13582250 Indicação de Proveniência Regulamentada | appellation | keep | medium | The real Arrábida IPR (under Palmela). |
| Q4917248 | Biscoitos (IPR) | PT | — | — | Q13582250 Indicação de Proveniência Regulamentada | appellation | none | medium |  |
| Q2940449 | Cartaxo (IPR) | PT | Q140562000 Do Tejo (DOC) | — | Q13582250 Indicação de Proveniência Regulamentada | appellation | keep | medium | Under Do Tejo (DOC); currently also the parent of Tejo (VR), which should be removed. |
| Q3053843 | Encostas da Nave (IPR) | — | Q3546429 Távora-Varosa (DOC) | — | Q13582250 Indicação de Proveniência Regulamentada | appellation | keep | medium | Under Távora-Varosa (DOC). |
| Q5884018 | Graciosa (IPR) | PT | — | — | Q13582250 Indicação de Proveniência Regulamentada | appellation | none | medium |  |
| Q6471797 | Lafões (IPR) | PT | — | — | Q13582250 Indicação de Proveniência Regulamentada | appellation | none | medium |  |
| Q3382513 | Pico (IPR) | PT | — | — | Q13582250 Indicação de Proveniência Regulamentada | appellation | none | medium |  |
| Q17355602 | Varosa (IPR) | — | — | — | Q13582250 Indicação de Proveniência Regulamentada | appellation | none | medium | Assumption: a predecessor of Távora-Varosa (DOC); possible historical duplicate. |

### Portuguese Vinhos Regionais (VR) (10)

Proposal: **region**. Confidence: medium. Basis: evidence+assumption. Status: proposed.

They carry the 'Vinhos regionais' class. A VR is a broad regional indication (PGI level) and the closest thing in this catalog to a wine region, so they keep kind region. Assumption: a VR is broader than the DOCs inside it, so a VR must never be a DOC's child.

| Wikidata ID | Name | CC | Parent | Name evidence | Other Wikidata classes | Proposed | Parent action | Conf. | Note |
|---|---|---|---|---|---|---|---|---|---|
| Q2835663 | Algarve (VR) | — | — | — | Q3560266 Vinhos regionais | region | none | medium |  |
| Q2875320 | Açores (VR) | — | — | — | Q3560266 Vinhos regionais | region | none | medium |  |
| Q4881369 | Beiras (VR) | PT | — | — | Q3560266 Vinhos regionais | region | none | medium |  |
| Q5316634 | Duriense (VR) | — | — | — | Q3560266 Vinhos regionais | region | none | medium |  |
| Q3242467 | Lisboa (VR) | — | — | — | Q3560266 Vinhos regionais | region | none | medium |  |
| Q374743 | Minho (VR) | — | Q1067753 Vinho Verde (DOC) | — | Q3560266 Vinhos regionais | region | remove | medium | Minho (VR) is listed under Vinho Verde (DOC), but the VR is the broader area. Remove the parent. |
| Q3518577 | Península de Setúbal (VR) | — | — | — | Q3560266 Vinhos regionais | region | none | medium |  |
| Q3430102 | Tejo (VR) | PT | Q2940449 Cartaxo (IPR) | — | Q3560266 Vinhos regionais | region | remove | medium | Tejo (VR) is listed under Cartaxo (IPR), an inverted hierarchy. Remove the parent. |
| Q7703313 | Terras Madeirenses (VR) | PT | — | — | Q3560266 Vinhos regionais | region | none | medium |  |
| Q121365790 | Terras de Sicó (VR) | PT | — | — | Q3560266 Vinhos regionais | region | none | medium | Alias 'Sub-Região Terras de Sicó'; assumption: a sub-region of a wider VR. |

### Douro, Port and the RDD (parent loop) (4)

Proposal: **see rows**. Confidence: medium. Basis: evidence+assumption. Status: needs-decision; questions: Q-DOURO.

RDD and 'Port Wine' are each other's parent, which is a loop. RDD is the demarcated region that contains DOC Douro and DOC Porto. Proposed: RDD stays a region with no parent; Douro (DOC) and Port Wine become appellations under RDD; Alto Douro Wine Region (the UNESCO landscape) stays a separate region, not merged.

| Wikidata ID | Name | CC | Parent | Name evidence | Other Wikidata classes | Proposed | Parent action | Conf. | Note |
|---|---|---|---|---|---|---|---|---|---|
| Q649738 | Alto Douro Wine Region | PT | — | — | Q210272 cultural heritage | region | none | medium | UNESCO cultural landscape inside the RDD. Related, not a duplicate; no merge. |
| Q1094448 | Douro (DOC) | PT | Q140379672 Região Demarcada do Douro (RDD) | flagged: DOC (name: “Douro (DOC)”) | Q451752 denominação de origem controlada | appellation | keep | high | DOC class plus label. Parent stays RDD. Its alias 'Região Demarcada do Douro' is the RDD's name and should be dropped. |
| Q191034 | Port Wine | — | Q140379672 Região Demarcada do Douro (RDD) | — | Q451752 denominação de origem controlada | appellation | keep | medium | DOC class (DOC Porto). Parent stays RDD. The record's label is the wine ('Port Wine'). |
| Q140379672 | Região Demarcada do Douro (RDD) | PT | Q191034 Port Wine | flagged: DOC (alias) | Q451752 denominação de origem controlada | region | remove | medium | Remove its parent (Port Wine) to break the loop. Its 'Douro DOC' alias clashes with the Douro (DOC) record. |

### Madeira wine (DOC) (1)

Proposal: **appellation**. Confidence: medium. Basis: evidence. Status: needs-decision; questions: Q-MADEIRA.

It carries the DOC class and is labelled '(DOC)', but the item is about the wine ('Madeira wine'). Proposed: appellation, and keep it (it is the only Madeira DOC record).

| Wikidata ID | Name | CC | Parent | Name evidence | Other Wikidata classes | Proposed | Parent action | Conf. | Note |
|---|---|---|---|---|---|---|---|---|---|
| Q27697 | Madeira wine (DOC) | — | — | flagged: DOC (name: “Madeira wine (DOC)”) | Q451752 denominação de origem controlada | appellation | none | medium | No country on record (Wikidata has none). |

### Duplicate 'Arrábida (IPR)': Q2879982 (1)

Proposal: **exclude-candidate**. Confidence: low. Basis: evidence+assumption. Status: needs-decision; questions: Q-ARRABIDA.

Two records share the label 'Arrábida (IPR)'. Q16010776 has the IPR class and sits under Palmela (DOC): the real Arrábida. Q2879982 has the DOC class, no parent, and its only alias is 'Bairrada (DOC)', so it is probably Bairrada DOC with a wrong English label. That can't be confirmed from the snapshot.

| Wikidata ID | Name | CC | Parent | Name evidence | Other Wikidata classes | Proposed | Parent action | Conf. | Note |
|---|---|---|---|---|---|---|---|---|---|
| Q2879982 | Arrábida (IPR) | PT | — | flagged: DOC (alias) | Q451752 denominação de origem controlada | exclude-candidate | none | low |  |

### French AOCs named 'X AOC' (17)

Proposal: **appellation**. Confidence: medium. Basis: evidence. Status: proposed.

The Wikidata label itself ends in 'AOC'. Only Côtes-du-Rhône Villages AOC also carries the AOC class (high); the rest rest on the label alone (medium).

| Wikidata ID | Name | CC | Parent | Name evidence | Other Wikidata classes | Proposed | Parent action | Conf. | Note |
|---|---|---|---|---|---|---|---|---|---|
| Q1019358 | Béarn AOC | FR | — | flagged: AOC (name: “Béarn AOC”) | — | appellation | none | medium |  |
| Q1025147 | Cadillac AOC | FR | — | flagged: AOC (name: “Cadillac AOC”) | — | appellation | none | medium |  |
| Q1090298 | Château-Chalon AOC | FR | — | flagged: AOC (name: “Château-Chalon AOC”) | — | appellation | none | medium |  |
| Q1136597 | Coteaux de Pierrevert AOC | FR | — | flagged: AOC (name: “Coteaux de Pierrevert AOC”) | — | appellation | none | medium |  |
| Q1151005 | Côtes du Rhône AOC | FR | — | flagged: AOC (name: “Côtes du Rhône AOC”) | — | appellation | none | medium |  |
| Q1151010 | Côtes du Roussillon AOC | FR | — | flagged: AOC (name: “Côtes du Roussillon AOC”) | — | appellation | none | medium |  |
| Q973682 | Côtes du Ventoux AOC | FR | Q1151005 Côtes du Rhône AOC | flagged: AOC (name: “Côtes du Ventoux AOC”) | — | appellation | remove? | medium | Parent is Côtes du Rhône AOC. Assumption: Ventoux is a separate southern-Rhône AOC, not part of the Côtes du Rhône AOC. |
| Q1151015 | Côtes du Vivarais AOC | FR | — | flagged: AOC (name: “Côtes du Vivarais AOC”) | — | appellation | none | medium |  |
| Q1422135 | Côtes-du-Rhône Villages AOC | FR | — | flagged: AOC (name: “Côtes-du-Rhône Villages AOC”) | Q1565828 appellation d'origine contrôlée | appellation | none | high | Also carries the AOC class. |
| Q470974 | Fitou AOC | FR | — | flagged: AOC (name: “Fitou AOC”) | — | appellation | none | medium |  |
| Q1150996 | Fronton AOC | FR | — | flagged: AOC (name: “Fronton AOC”) | — | appellation | none | medium |  |
| Q532734 | Margaux AOC | FR | — | flagged: AOC (name: “Margaux AOC”) | — | appellation | none | medium |  |
| Q2120260 | Maury AOC | FR | — | flagged: AOC (name: “Maury AOC”) | — | appellation | none | medium |  |
| Q2123199 | Quincy AOC | FR | — | flagged: AOC (name: “Quincy AOC”) | — | appellation | none | medium |  |
| Q2146579 | Reuilly AOC | FR | — | flagged: AOC (name: “Reuilly AOC”) | — | appellation | none | medium |  |
| Q2167339 | Rosette AOC | FR | — | flagged: AOC (name: “Rosette AOC”) | — | appellation | none | medium |  |
| Q507055 | Vinsobres AOC | FR | — | flagged: AOC (name: “Vinsobres AOC”) | — | appellation | none | medium |  |

### French AOCs with '(AOC)' only in an alias (14)

Proposal: **appellation**. Confidence: medium. Basis: evidence+assumption. Status: proposed.

Their aliases are '<name> (AOC)', and they carry no class besides wine-producing region. Assumption: these names are AOCs (true for all 14, from domain knowledge). Chenas and Côteaux du Giennois are also wrongly typed 'winery' in Wikidata; see their rows.

| Wikidata ID | Name | CC | Parent | Name evidence | Other Wikidata classes | Proposed | Parent action | Conf. | Note |
|---|---|---|---|---|---|---|---|---|---|
| Q892806 | Bonnezeaux | FR | — | flagged: AOC (alias) | — | appellation | none | medium |  |
| Q1090927 | Chenas | FR | — | flagged: AOC (alias) | Q156362 winery, Q3558198 Beaujolais vineyard | appellation | none | medium | Wikidata types it 'winery' (wrong) and 'Beaujolais vineyard' (a Beaujolais cru). |
| Q1136603 | Coteaux du Languedoc | FR | — | flagged: AOC (alias) | — | appellation | none | medium | Alias 'La Clape' is a separate cru; assumption: the AOC was renamed 'Languedoc'. |
| Q1136602 | Coteaux du Loir | FR | — | flagged: AOC (alias) | — | appellation | none | medium |  |
| Q1136606 | Coteaux du Lyonnais | FR | — | flagged: AOC (alias) | — | appellation | none | medium |  |
| Q1150937 | Côte Roannaise | FR | — | flagged: AOC (alias) | — | appellation | none | medium |  |
| Q1136598 | Côteaux du Giennois | FR | — | flagged: AOC (alias) | Q156362 winery | appellation | none | medium | Wikidata types it 'winery' (wrong). |
| Q1150990 | Côtes de Provence | FR | — | flagged: AOC (alias) | — | appellation | none | medium |  |
| Q1150991 | Côtes du Forez | FR | — | flagged: AOC (alias) | — | appellation | none | medium |  |
| Q1150995 | Côtes du Jura wine | FR | — | flagged: AOC (alias) | — | appellation | none | medium |  |
| Q1151017 | Côtes d’Auvergne | FR | — | flagged: AOC (alias) | — | appellation | none | medium |  |
| Q2922357 | Hautes-Côtes de Beaune | FR | Q1016093 Burgundy wine region | flagged: AOC (alias) | — | appellation | keep | medium | Under Burgundy wine region, so lookup gives region 'Burgundy wine region'. |
| Q1683850 | Jasnières | FR | — | flagged: AOC (alias) | — | appellation | none | medium |  |
| Q3560958 | Viré-Clessé | FR | — | flagged: AOC (alias) | — | appellation | none | medium |  |

### Other French candidates (unflagged) (5)

Proposal: **see rows**. Confidence: medium. Basis: evidence+assumption. Status: proposed.

Decided one by one: Beaujolais cru, Rhône village wine, vineyard area, wine region, hill range.

| Wikidata ID | Name | CC | Parent | Name evidence | Other Wikidata classes | Proposed | Parent action | Conf. | Note |
|---|---|---|---|---|---|---|---|---|---|
| Q1016093 | Burgundy wine region | FR | — | — | Q2555824 (no label) | region | none | high | Parent of Hautes-Côtes de Beaune. |
| Q1074779 | Chiroubles | FR | — | — | Q3558198 Beaujolais vineyard | appellation | none | medium | 'Beaujolais vineyard' class; assumption: a Beaujolais cru is an AOC. |
| Q3297627 | Saint-Thierry Massif | FR | — | — | Q46831 mountain range | region | none | high | Hill range (Champagne). |
| Q28497141 | Vaison-la-romaine wine | FR | — | — | Q1891041 Rhône wine | appellation | none | low | A Côtes-du-Rhône Villages village wine ('Rhône wine' class). Appellation-level; could also be dropped as a wine item. |
| Q763660 | Vignoble de Chablis | FR | — | — | Q22715 vineyard | region | none | medium | 'vineyard' class: the Chablis vineyard area. Stays a region; a label's appellation 'Chablis' gives no region (PR #17). |

### Spanish DOs named with the designation (4)

Proposal: **appellation**. Confidence: high. Basis: evidence. Status: proposed.

The label carries DO, DOP or PDO. Tierra del Vino de Zamora DO also carries the 'appellation' class.

| Wikidata ID | Name | CC | Parent | Name evidence | Other Wikidata classes | Proposed | Parent action | Conf. | Note |
|---|---|---|---|---|---|---|---|---|---|
| Q2887617 | Calatayud PDO | ES | — | flagged: PDO/PGI (name: “Calatayud PDO”) | — | appellation | none | high |  |
| Q2935540 | Campo de Borja (DO) | ES | — | flagged: DO (name: “Campo de Borja (DO)”) | — | appellation | none | high |  |
| Q1754563 | Priorat (DO) | ES | — | flagged: DO (name: “Priorat (DO)”) | — | appellation | none | high |  |
| Q544423 | Tierra del Vino de Zamora DO | ES | — | flagged: DO (name: “Tierra del Vino de Zamora DO”) | Q2858704 appellation | appellation | none | high | Also carries the 'appellation' class. |

### Spanish DOs whose name is also the everyday region name (7)

Proposal: **appellation**. Confidence: medium. Basis: evidence+assumption. Status: needs-decision; questions: Q-ES-DUAL.

Their aliases are DO or DOCa forms, but the bare name (Rioja, Ribera del Duero…) is also used as a region. Abona carries the 'appellation' class (evidence); the others are base-only. Proposed: appellation. Since PR #17, a label's appellation text never makes them the region anyway.

| Wikidata ID | Name | CC | Parent | Name evidence | Other Wikidata classes | Proposed | Parent action | Conf. | Note |
|---|---|---|---|---|---|---|---|---|---|
| Q322801 | Abona | ES | — | flagged: ES-phrase (alias) | Q2858704 appellation | appellation | none | high | Carries the 'appellation' class. |
| Q624640 | Bierzo | ES | — | flagged: DO (alias) | — | appellation | none | medium |  |
| Q2832748 | Cariñena | ES | — | flagged: DO (alias) | — | appellation | none | medium |  |
| Q6746472 | Designation of Origin Pla de Bages (Wine Region) | ES | — | flagged: ES-phrase (alias) | — | appellation | none | medium |  |
| Q2167338 | Ribera del Duero | ES | — | flagged: DO (alias) | — | appellation | none | medium |  |
| Q1569384 | Rioja | ES | — | flagged: DOC (alias) | — | appellation | none | medium |  |
| Q1938017 | Somontano | ES | — | flagged: DO (alias) | — | appellation | none | medium |  |

### Valle de la Orotava (DO) vs Orotava Valley (valley) (2)

Proposal: **see rows**. Confidence: medium. Basis: evidence. Status: proposed.

Two records, one name. Q2509282 is the DO (aliases 'Denominación de Origen…', '(vino)'). Q1290583 is the valley (classes valley, landscape, comarca) and carries 'Valle de la Orotava' as an alias. Today both are regions with equal score, so a lookup of 'Valle de la Orotava' is marked ambiguous and fills nothing. Proposed: Q2509282 → appellation, Q1290583 stays region. Lookup then prefers the appellation and the ambiguity goes away.

| Wikidata ID | Name | CC | Parent | Name evidence | Other Wikidata classes | Proposed | Parent action | Conf. | Note |
|---|---|---|---|---|---|---|---|---|---|
| Q1290583 | Orotava Valley | ES | — | — | Q39816 valley, Q107425 landscape, Q1345234 comarca of Spain | region | none | high | The valley record. |
| Q2509282 | Valle de la Orotava | ES | — | flagged: ES-phrase (alias) | Q82794 region | appellation | none | medium | The DO record. |

### Spanish PGIs (Vino de la Tierra) (4)

Proposal: **appellation**. Confidence: low. Basis: evidence+assumption. Status: needs-decision; questions: Q-ES-PGI.

Labelled 'PGI', with 'Vino de la Tierra' aliases. A PGI is a protected indication, not a designation of origin. The schema has only region/subregion/appellation; 'appellation' is the slot a label puts it in. Ribera del Queiles carries the 'designation of origin' class, which contradicts its label (assumption: the label is right; the register decides).

| Wikidata ID | Name | CC | Parent | Name evidence | Other Wikidata classes | Proposed | Parent action | Conf. | Note |
|---|---|---|---|---|---|---|---|---|---|
| Q7322326 | Ribera del Gállego-Cinco Villas PGI | ES | — | flagged: PDO/PGI (name: “Ribera del Gállego-Cinco Villas PGI”) | — | appellation | none | low |  |
| Q7322327 | Ribera del Jiloca PGI | ES | — | flagged: PDO/PGI (name: “Ribera del Jiloca PGI”) | — | appellation | none | low |  |
| Q1384248 | Ribera del Queiles PGI | ES | — | flagged: PDO/PGI (name: “Ribera del Queiles PGI”) | Q325668 designation of origin | appellation | none | low | Class 'designation of origin' contradicts the 'PGI' label. |
| Q7909361 | Valdejalón PGI | ES | — | flagged: PDO/PGI (name: “Valdejalón PGI”) | — | appellation | none | low |  |

### Sherry Triangle (1)

Proposal: **region**. Confidence: medium. Basis: evidence. Status: proposed.

Class 'region'; it's the geographic area (Marco de Jerez), not DO Jerez itself. Stays a region.

| Wikidata ID | Name | CC | Parent | Name evidence | Other Wikidata classes | Proposed | Parent action | Conf. | Note |
|---|---|---|---|---|---|---|---|---|---|
| Q30674832 | Sherry Triangle | ES | — | — | Q82794 region | region | none | medium |  |

### Italian DOC duplicates and the items typed 'wine' (5)

Proposal: **appellation**. Confidence: low. Basis: evidence+assumption. Status: needs-decision; questions: Q-IT-DUP.

Bivongi DOC, Friuli Annia DOC and Colli Romagna Centrale DOC are typed 'wine'. Bivongi and Friuli Annia also have a same-named region record (Q140131443 Bivongi, Q140131124 Friuli Annia). Colli Piacentini (typed 'hill group', alias 'Colli piacentini (DOC)') has a twin, Q140131139. Proposed: the DOC-labelled record becomes the appellation; whether to drop or keep the plain twins (Q14013xxxx, base class only) is your decision. Alto Adige is typed 'wine', and its aliases wrongly include 'Trentino'.

| Wikidata ID | Name | CC | Parent | Name evidence | Other Wikidata classes | Proposed | Parent action | Conf. | Note |
|---|---|---|---|---|---|---|---|---|---|
| Q140131057 | Alto Adige | IT | — | — | Q282 wine | region | none | low | Typed 'wine'. Both a DOC and a province; aliases wrongly include 'Trentino'. Proposed: keep region and drop the 'Trentino' alias. |
| Q139916958 | Bivongi DOC | IT | — | flagged: DOC (name: “Bivongi DOC”) | Q282 wine | appellation | none | low | Typed 'wine'. Twin: Q140131443 'Bivongi'. |
| Q2983286 | Colli Piacentini | IT | — | flagged: DOC (alias) | Q19850234 hill group | appellation | none | low | Typed 'hill group'; alias 'Colli piacentini (DOC)'. Twin: Q140131139. |
| Q26260858 | Colli Romagna Centrale DOC | IT | — | flagged: DOC (name: “Colli Romagna Centrale DOC”) | Q282 wine | appellation | none | low | Typed 'wine'. Alias 'Vins d'Émilie-Romagne' is too broad. |
| Q16557744 | Friuli Annia DOC | IT | — | flagged: DOC (name: “Friuli Annia DOC”) | Q282 wine | appellation | none | low | Typed 'wine'. Twin: Q140131124 'Friuli Annia'. |

### Italian areas typed 'region' (dual DOC/area names) (11)

Proposal: **region**. Confidence: medium. Basis: evidence. Status: proposed.

Wikidata types them as a region, hill chain, cultural landscape and so on. The same names are also DOC(G)s (Chianti, Roero, Valpolicella, Franciacorta…), but nothing in the evidence says the record is the designation. They stay regions; PR #17 already stops the appellation text making them the region. Franciacorta is the weakest (a DOCG name typed only 'region').

| Wikidata ID | Name | CC | Parent | Name evidence | Other Wikidata classes | Proposed | Parent action | Conf. | Note |
|---|---|---|---|---|---|---|---|---|---|
| Q1071629 | Chianti | IT | — | — | Q82794 region | region | none | medium |  |
| Q241136 | Euganean Hills | IT | — | — | Q9381142 hill chain | region | none | medium |  |
| Q140131034 | Franciacorta | IT | — | — | Q82794 region | region | none | low | A DOCG name typed only 'region'. Assumption-based alternative: appellation. |
| Q1109872 | Gorizia Hills | SI | — | — | Q46831 mountain range | region | none | medium | Typed 'mountain range'; alias 'Collio' is also a DOC name. |
| Q19865 | Langhe | IT | Q17296768 The Vineyard Landscape of Piedmont: Langhe-Roero and Monferrato | — | Q82794 region | region | keep | medium | Parent: the UNESCO landscape (Q17296768). |
| Q65029145 | Le Colline del Prosecco di Conegliano e Valdobbiadene | IT | — | — | Q22698 park, Q1129474 cultural landscape, Q3270079 hogback, Q9381142 hill chain | region | none | medium |  |
| Q19868 | Montferrat | IT | Q17296768 The Vineyard Landscape of Piedmont: Langhe-Roero and Monferrato | — | Q82794 region, Q1620908 historical region | region | keep | medium | Parent: the UNESCO landscape (Q17296768). |
| Q19870 | Roero | IT | — | — | Q82794 region | region | none | medium |  |
| Q17296768 | The Vineyard Landscape of Piedmont: Langhe-Roero and Monferrato | IT | — | — | Q1129474 cultural landscape | region | none | medium | UNESCO landscape, currently the parent of Langhe and Montferrat. Assumption: a UNESCO site is a poor region parent. |
| Q852467 | Valpolicella | IT | — | — | Q82794 region, Q105224099 group of valleys | region | none | medium |  |
| Q448096 | Vulture | IT | — | — | Q82794 region | region | none | medium |  |

### Switzerland (2)

Proposal: **appellation**. Confidence: medium. Basis: evidence. Status: proposed.

Dézaley carries the AOC class (high). La Côte has 'La Côte AOC' as an alias and is also a Vaud sub-region (medium).

| Wikidata ID | Name | CC | Parent | Name evidence | Other Wikidata classes | Proposed | Parent action | Conf. | Note |
|---|---|---|---|---|---|---|---|---|---|
| Q1270756 | Dézaley | CH | — | — | Q1565828 appellation d'origine contrôlée | appellation | none | high | AOC class; Lavaux grand cru. |
| Q666244 | La Côte | CH | — | flagged: AOC (alias) | — | appellation | none | medium | Alias 'La Côte AOC'. |

### Austria (1)

Proposal: **appellation**. Confidence: medium. Basis: evidence. Status: proposed.

Labelled 'DAC'; no class to confirm it.

| Wikidata ID | Name | CC | Parent | Name evidence | Other Wikidata classes | Proposed | Parent action | Conf. | Note |
|---|---|---|---|---|---|---|---|---|---|
| Q55632668 | Schilcherland DAC | AT | — | flagged: DAC (name: “Schilcherland DAC”) | — | appellation | none | medium |  |

### New Zealand GIs (7)

Proposal: **region**. Confidence: high. Basis: evidence+assumption. Status: proposed.

They carry the 'geographical indication' class. A New Zealand GI is the official wine region (assumption, consistent with every label), so they stay regions. Waiheke Island stays under Auckland; North Canterbury's parent 'New Zealand wine' is a country-level item (see that row).

| Wikidata ID | Name | CC | Parent | Name evidence | Other Wikidata classes | Proposed | Parent action | Conf. | Note |
|---|---|---|---|---|---|---|---|---|---|
| Q117085188 | Auckland wine region | NZ | — | flagged: GI (alias) | Q117085231 geographical indication | region | none | high |  |
| Q5061573 | Central Otago wine region | NZ | — | flagged: GI (alias) | Q117085231 geographical indication | region | none | high |  |
| Q85765961 | Hawke's Bay wine region | NZ | — | — | Q117085231 geographical indication | region | none | high |  |
| Q85783963 | Marlborough wine region | NZ | — | — | Q117085231 geographical indication | region | none | high |  |
| Q117074142 | North Canterbury wine region | NZ | Q918446 New Zealand wine | — | Q117085231 geographical indication | region | keep | high | Parent 'New Zealand wine' (country-level item). |
| Q117074428 | Waiheke Island wine region | NZ | Q117085188 Auckland wine region | — | Q117085231 geographical indication | region | keep | high | Under Auckland. |
| Q131767653 | Waitaki Valley | NZ | — | flagged: GI (alias) | Q117085231 geographical indication | region | none | high |  |

### New Zealand sub-areas typed 'trademark' (2)

Proposal: **subregion**. Confidence: low. Basis: evidence+assumption. Status: needs-decision; questions: Q-NZ-SUB.

Gimblett Gravels and Bridge Pa Triangle sit under Hawke's Bay and are typed 'trademark' (a growers' mark, not a GI). Proposed: subregion of Hawke's Bay, so lookup gives subregion plus region Hawke's Bay. Or keep them as regions.

| Wikidata ID | Name | CC | Parent | Name evidence | Other Wikidata classes | Proposed | Parent action | Conf. | Note |
|---|---|---|---|---|---|---|---|---|---|
| Q119953341 | Bridge Pa Triangle | NZ | Q85765961 Hawke's Bay wine region | — | Q167270 trademark | subregion | keep | low |  |
| Q119953361 | Gimblett Gravels | NZ | Q85765961 Hawke's Bay wine region | — | Q167270 trademark | subregion | keep | low |  |

### 'New Zealand wine' (country-level item) (1)

Proposal: **exclude-candidate**. Confidence: medium. Basis: evidence. Status: needs-decision; questions: Q-NZ-COUNTRY.

Typed 'aspect in a geographic region': it is New Zealand viticulture, not a wine region. It is North Canterbury's parent, so lookup would offer 'New Zealand wine' as North Canterbury's region.

| Wikidata ID | Name | CC | Parent | Name evidence | Other Wikidata classes | Proposed | Parent action | Conf. | Note |
|---|---|---|---|---|---|---|---|---|---|
| Q918446 | New Zealand wine | NZ | — | — | Q74817647 aspect in a geographic region | exclude-candidate | none | medium |  |

### Chilean DOs (typed PDO) (8)

Proposal: **region**. Confidence: medium. Basis: evidence+assumption. Status: needs-decision; questions: Q-CL.

Typed 'Protected designation of origin'. In Chile the DO names are the official wine regions, subregions and zones (Valle Central ⊃ Valle del Rapel ⊃ Colchagua/Cachapoal), so they stay regions. Wikidata gives them no parent links.

| Wikidata ID | Name | CC | Parent | Name evidence | Other Wikidata classes | Proposed | Parent action | Conf. | Note |
|---|---|---|---|---|---|---|---|---|---|
| Q6159201 | Cachapoal Valley | CL | — | — | Q13439060 Protected designation of origin | region | none | medium |  |
| Q6159082 | Colchagua Valley | CL | — | — | Q13439060 Protected designation of origin | region | none | medium |  |
| Q5061975 | Valle Central | CL | — | — | Q13439060 Protected designation of origin | region | none | medium |  |
| Q6159210 | Valle del Elqui | CL | — | — | Q13439060 Protected designation of origin | region | none | medium |  |
| Q6159230 | Valle del Itata | CL | — | — | Q13439060 Protected designation of origin | region | none | medium |  |
| Q6159234 | Valle del Lontué | CL | — | — | Q13439060 Protected designation of origin | region | none | medium |  |
| Q6159235 | Valle del Maipo | CL | — | — | Q13439060 Protected designation of origin | region | none | medium |  |
| Q5573789 | Valle del Rapel | CL | — | — | Q13439060 Protected designation of origin | region | none | medium |  |

### Other designation evidence (2)

Proposal: **see rows**. Confidence: low. Basis: evidence+assumption. Status: needs-register; questions: Q-OTHER-REG.

Don Valley (RU) is typed 'designation of origin'. Nemea (GR, a PDO in reality) carries only an unlabelled class (Q2555824). Register check needed.

| Wikidata ID | Name | CC | Parent | Name evidence | Other Wikidata classes | Proposed | Parent action | Conf. | Note |
|---|---|---|---|---|---|---|---|---|---|
| Q121150641 | Don Valley | RU | — | — | Q325668 designation of origin | appellation | none | low | Typed 'designation of origin'. |
| Q1283900 | Nemea | GR | — | — | Q2555824 (no label) | region | none | low | Unlabelled class Q2555824; assumption: a PDO. Stays a region until the register is checked. |

### Other regions with non-designation extra classes (9)

Proposal: **region**. Confidence: high. Basis: evidence. Status: proposed.

The extra classes are geographic or administrative (settlement, valley, landscape, district, town, region of Western Australia, Hungarian small region). Nothing suggests a designation, so they stay regions. Recaș, Silagiu and Koelenhof are towns typed as wine regions: a data-quality note only.

| Wikidata ID | Name | CC | Parent | Name evidence | Other Wikidata classes | Proposed | Parent action | Conf. | Note |
|---|---|---|---|---|---|---|---|---|---|
| Q123003993 | Koelenhof | ZA | — | — | Q486972 human settlement, Q3395383 agricultural land | region | none | high |  |
| Q65040905 | Koshu Valley | JP | — | — | Q39816 valley | region | none | high |  |
| Q2448665 | Landscape of the Pico Island Vineyard Culture | PT | — | — | Q210272 cultural heritage, Q759882 protected landscape area | region | none | high |  |
| Q125701413 | Muldersvlei district | ZA | — | — | Q82794 region | region | none | high |  |
| Q325555 | Recaș | RO | — | — | Q1200957 tourist destination, Q16858213 town in Romania | region | none | high |  |
| Q744483 | Silagiu | RO | — | — | Q1200957 tourist destination, Q15921247 constituent locality | region | none | high |  |
| Q641419 | Swan Valley | AU | — | — | Q60297 Regions of Western Australia | region | none | high |  |
| Q828125 | Tokaj wine region | HU | — | — | Q1162817 geographical small region of Hungary | region | none | high |  |
| Q128996548 | vineyards of Nierstein | DE | Q567327 Rheinhessen? | — | Q15642541 human-geographic territorial entity | region | keep | high |  |

