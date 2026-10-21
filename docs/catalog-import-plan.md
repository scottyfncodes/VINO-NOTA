# First catalog import: audit and plan

Status: **proposal, awaiting approval.** Nothing in this document has been imported anywhere. Production's catalog tables are empty, and no Preview database holds catalog data.

## 1. What was audited

- **Snapshot:** the Wikidata snapshot fetched by the `catalog-ingest` workflow (run 39274231162) and its appellation audit (`report-appellation-audit.json`).
- **Code:** `src/server/db/schema.ts` (catalog tables), `src/server/reference/{wikidata,import,lookup}.ts`, `src/lib/domain/{catalog,appellation-audit}.ts`, `scripts/catalog/*`, `.github/workflows/catalog-ingest.yml`, and the unit and integration tests for each.
- **Production database** (read-only queries only): Neon project `twilight-paper-99193935`, branch `main`, endpoint `ep-winter-glade-b7ewqow0`. Every `catalog_*` table has 0 rows. No user wines exist yet.

### Findings

| Finding | Detail |
|---|---|
| Flagged regions | 103 of 516 (20%). 74 carry a designation in their own name; 29 only in an alias. |
| Wikimedia category items | 2 (`Category:Aylés (DO)`, `Category:Urbezo (DO)`). These are not places. |
| Possible duplicate concept | `Douro (DOC)` Q1094448 and `Região Demarcada do Douro (RDD)` Q140379672. |
| Alias conflict | `Arrábida (IPR)` Q2879982 has the alias `Bairrada (DOC)`, which is another record's name. |
| Not a place | `Madeira wine (DOC)` Q27697 is labelled as a wine. |
| Whitespace | `Dão  (DOC)`, `Tavira  (DOC)`. Already fixed by validation, which collapses spaces. |
| Wines | Only 7 of 2,888 wines link to a producer, so they are not yet useful for matching. |
| Name collisions | 12 producer and 9 region names are shared by different ids, which is expected (e.g. one name in two countries). Lookup already treats these as ambiguous unless a country disambiguates them. |

**About the evidence.** The audit is a name-pattern heuristic. It can say that a name contains "DOC". It cannot say what Wikidata or an official register classifies the item as. Authoritative sources would be:

- Wikidata `P31` (instance of): for example Q2140699 "wine-producing region" versus an appellation class.
- The EU's eAmbrosia register for PDO and PGI.
- National registers: INAO (France), IVV (Portugal), MAPA (Spain), MASAF (Italy).

None of these can be reached from this environment. Only GitHub Actions can query Wikidata. So **no reclassification is proposed as fact.** Every case below is either resolved by a rule that needs no external evidence, or explicitly marked unresolved.

## 2. Scope of the first import

| | Proposed |
|---|---|
| Target | A dedicated Preview Neon branch (see §6). Never Production. |
| Source | Wikidata only (`catalog_source.key = wikidata`). |
| Record types | **Regions and grapes only.** Producers and wines wait until linkage improves. This is enforced by `catalog:import --only regions,grapes`, which leaves every other record type's rows and aliases untouched. |
| Region kinds | As fetched (`region`). No reclassification until §3 is decided. |

**Expected counts**, recounted by the dry run before any apply:

| Record type | Expected count |
|---|---|
| Regions | 516 fetched, minus 2 rejected namespace pages = **514** |
| Grapes | about 1,924 |
| Aliases | about 5,200 |

The first dry run is the authority on these numbers. If it differs from them by more than 1%, stop and investigate before applying.

## 3. Appellation corrections

Each of the 103 flagged records falls into exactly one group. The full list, record by record, is in the appendix.

| Group | Count | Proposed handling | Confidence | Status |
|---|---:|---|---|---|
| **E**: Wikimedia namespace page | 2 | Rejected by validation (this PR) | High: the label itself is a Wikimedia namespace page | **Resolved** |
| **N**: DO, DOC, AOC, PDO or DAC in its own name | 66 | Candidate for `kind = appellation` | Medium: the name is a designation, but P31 is unchecked | Unresolved |
| **P**: Spanish "PGI" in its own name | 4 | Decide: region or appellation | Low: a PGI is a protected indication, not a designation of origin | Unresolved |
| **A**: designation only in an alias | 27 | Candidate: keep as `region` | Medium: likely a region named after its DO | Unresolved |
| **S**: special case | 4 | Individual review (see the appendix) | Low | Unresolved |

**Why reclassifying is not automatic.** Changing `kind` changes how lookup behaves:

- Lookup prefers an appellation over a region with the same name.
- A place of kind `appellation` fills the reading's `appellation` field, not its `region` field.

Even in group N, some records might be both a wine region and a DOC.

**How each unresolved record gets resolved** (proposed): add a Wikidata `P31` fetch for the flagged ids to `fetch-wikidata`. The audit can then show each record's actual class next to its heuristic flag. Records whose `P31` names an appellation class move to `kind = appellation` by rule, and anything else stays for manual review. This change needs its own approval (§7).

## 4. Matching and duplicate prevention

The importer already implements these rules, and tests cover them:

- **Identity:** each record is keyed on `(source_id, external_id)` and upserted, never matched by name. Re-running the same snapshot writes nothing.
- **Duplicate ids** within a batch: the first record is kept, and the rest are counted and dropped.
- **Aliases:**
  - Normalised (accents, case, spacing), de-duplicated, capped at 50 per record.
  - An alias equal to the record's own name is dropped.
  - Aliases are kept in sync with the snapshot: added and removed.
- **Shared names across ids:** stored as separate records. Lookup reports them as ambiguous unless the label's country decides.
- **New in this PR:**
  - Wikimedia namespace pages are rejected.
  - The audit points out *possible* duplicate concepts and alias mix-ups (`review.sameBaseAs`, `review.aliasNamesOf`) for a person to decide. Nothing is merged automatically.

## 5. Validation checks

**Before apply** (dry run, `npm run catalog:import -- --dir <snapshot>`, which is the default mode):

1. The target check passes:
   - the endpoint is not `ep-winter-glade-b7ewqow0`;
   - `VERCEL_ENV` is not production;
   - the host is recognisable.
2. Inserted counts match §2, give or take 1%. Updated is 0 and stale is 0 on an empty database.
3. The rejected list contains exactly the 2 namespace pages, plus any reasons that are listed and reviewed.
4. The appellation audit report is attached to the workflow run.

**After apply:**

5. `npm run catalog:validate -- --source wikidata` exits 0. That means records exist, provenance is complete, identifiers are well-formed and the probe lookups don't error. Also check by hand:
   - its row counts equal the dry run's;
   - its duplicate-name list matches the collisions in §1.
6. A second apply of the same snapshot reports 0 inserted, 0 updated and 0 stale. The Preview job's "Re-import (must change nothing)" step enforces this.
7. Spot lookups on the Preview deployment: "Margaux", "Rioja", "Douro" and "Tempranillo".

## 6. Target, error handling, repeatability and rollback

- **Target:**
  - A **schema-only** Neon branch, `catalog-preview`, in project `twilight-paper-99193935`. It is created in the Neon Console with auto-delete turned off, so it copies no user rows.
  - A schema-only branch starts with an empty migration journal. Its `drizzle.__drizzle_migrations` table is seeded with Production's 2 migration hashes (schema metadata, not user data) so that `db:migrate` doesn't re-create existing tables.
  - Its endpoint id is recorded before any write, and must differ from `ep-winter-glade-b7ewqow0`.
  - The import job reads it from the `catalog-preview` GitHub environment secret `CATALOG_PREVIEW_DATABASE_URL`, and gets the Production id from the variable `PRODUCTION_DB_ENDPOINT_ID`.
  - Before anything else, the job runs `catalog:inspect-target` read-only. It fails unless the secret points at the `preview_endpoint_id` input and the database holds no user accounts.
  - The workflow input `preview_mode` takes three values:
    - `verify` (the default) stops after that check;
    - `dry-run` adds the migration (a no-op) and the dry run;
    - `import` applies, re-imports and validates.
  - `snapshot_run_id` makes an import use the exact snapshot whose dry run was reviewed.
- **Failure:**
  - Each source imports in one transaction. Any error rolls the whole batch back; an integration test covers this.
  - Re-running the same snapshot is the recovery step. It is safe because the import is idempotent; a new integration test covers this too.
- **Repeatability:**
  - Snapshots are files kept as workflow artifacts, and the importer reads only those files.
  - Re-importing a snapshot always gives the same rows.
- **Rollback:**
  - A schema-only branch has no parent, so it can't be reset from one. A full rollback means either deleting the Wikidata catalog rows on that branch, or deleting and re-creating the branch. Both need approval at the time.
  - Later, a bad import is reverted by re-importing the previous snapshot. Records missing from a newer snapshot are reported as stale and **never deleted automatically**.

## 7. Decisions needed

1. **The Preview target.** Approve creating the Neon branch `catalog-preview` from `main`. Note that a branch copies `main`'s data, including its 2 user accounts. A schema-only branch avoids that copy and is recommended. Also approve adding the GitHub environment `catalog-preview` with its secret and variable. You add the secret yourself; it is never pasted into chat.
2. **Scope.** Approve importing regions and grapes only, as in §2.
3. **Group N, P, A and S records.** Choose one:
   - import them as fetched for the Preview review (recommended); or
   - hold them back until they are resolved.
4. **The P31 enrichment** (§3). Approve adding the class fetch, so group N, P and A can be resolved from evidence.
5. **Production.** A separate approval, after the Preview review. It uses `--allow-production` with `CATALOG_CONFIRM_ENDPOINT=ep-winter-glade-b7ewqow0`.

## Appendix: every flagged region

Group key: E namespace page · N designation in own name · P Spanish PGI · A alias only · S special case.

| Wikidata ID | Name | Group | Evidence (heuristic) | Proposed handling | Confidence | Status |
|---|---|---|---|---|---|---|
| Q322801 | Abona | A | ES-phrase only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q2832671 | Alenquer (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q2832668 | Alentejo (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q16250875 | Almeirim (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q2879982 | Arrábida (IPR) | S | Aliases are “Bairrada (DOC)”, another record’s name | Review: drop the conflicting aliases at source | Low | Unresolved |
| Q2864234 | Arruda (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q117085188 | Auckland wine region | A | GI only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q1019358 | Béarn AOC | N | AOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q2894017 | Beira Interior (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q624640 | Bierzo | A | DO only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q139916958 | Bivongi DOC | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q892806 | Bonnezeaux | A | AOC only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q4944340 | Borba (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q2927430 | Bucelas (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q1025147 | Cadillac AOC | N | AOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q2887617 | Calatayud PDO | N | PDO/PGI in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q2935540 | Campo de Borja (DO) | N | DO in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q2937990 | Carcavelos (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q2832748 | Cariñena | A | DO only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q5049724 | Castelo Rodrigo (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q131278789 | Category:Aylés (DO) | E | Wikimedia category item, not a place | Excluded by validation (this PR) | High | Resolved |
| Q131278782 | Category:Urbezo (DO) | E | Wikimedia category item, not a place | Excluded by validation (this PR) | High | Resolved |
| Q5061573 | Central Otago wine region | A | GI only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q5070264 | Chamusca (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q1090298 | Château-Chalon AOC | N | AOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q2961726 | Chaves (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q1090927 | Chenas | A | AOC only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q2982350 | Colares (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q2983286 | Colli Piacentini | A | DOC only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q26260858 | Colli Romagna Centrale DOC | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q5173389 | Coruche (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q1150937 | Côte Roannaise | A | AOC only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q1136597 | Coteaux de Pierrevert AOC | N | AOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q1136598 | Côteaux du Giennois | A | AOC only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q1136603 | Coteaux du Languedoc | A | AOC only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q1136602 | Coteaux du Loir | A | AOC only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q1136606 | Coteaux du Lyonnais | A | AOC only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q1151017 | Côtes d’Auvergne | A | AOC only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q1150990 | Côtes de Provence | A | AOC only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q1150991 | Côtes du Forez | A | AOC only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q1150995 | Côtes du Jura wine | A | AOC only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q1151005 | Côtes du Rhône AOC | N | AOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q1151010 | Côtes du Roussillon AOC | N | AOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q973682 | Côtes du Ventoux AOC | N | AOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q1151015 | Côtes du Vivarais AOC | N | AOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q1422135 | Côtes-du-Rhône Villages AOC | N | AOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q5178877 | Cova da Beira (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q1269612 | Dão (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q6746472 | Designation of Origin Pla de Bages (Wine Region) | A | DO only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q140562000 | Do Tejo (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q1094448 | Douro (DOC) | S | Possible duplicate of Q140379672 (Região Demarcada do Douro) | Review: merge or keep both | Low | Unresolved |
| Q3053850 | Encostas d'Aire (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q5418766 | Évora (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q470974 | Fitou AOC | N | AOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q16557744 | Friuli Annia DOC | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q1150996 | Fronton AOC | N | AOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q5595971 | Granja-Amareleja (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q2922357 | Hautes-Côtes de Beaune | A | AOC only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q1683850 | Jasnières | A | AOC only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q666244 | La Côte | A | AOC only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q3216175 | Lagoa (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q3216201 | Lagos (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q3264017 | Lourinhã (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q27697 | Madeira wine (DOC) | S | Label names a wine (“Madeira wine”), not a place | Review: keep, rename, or exclude | Low | Unresolved |
| Q532734 | Margaux AOC | N | AOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q2120260 | Maury AOC | N | AOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q281996 | Moscatel de Setúbal (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q6925854 | Moura (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q3593638 | Óbidos (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q2864253 | Palmela (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q7195876 | Pinhel (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q7200946 | Planalto Mirandês (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q7231505 | Portalegre (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q3399320 | Portimão (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q1754563 | Priorat (DO) | N | DO in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q2123199 | Quincy AOC | N | AOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q7306190 | Redondo (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q140379672 | Região Demarcada do Douro (RDD) | S | Possible duplicate of Q1094448 (Douro DOC) | Review: merge or keep both | Low | Unresolved |
| Q7309570 | Reguengos (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q2146579 | Reuilly AOC | N | AOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q2167338 | Ribera del Duero | A | DO only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q7322326 | Ribera del Gállego-Cinco Villas PGI | P | PDO/PGI in its own name; a protected indication, not necessarily an appellation | Review: region or appellation | Low | Unresolved |
| Q7322327 | Ribera del Jiloca PGI | P | PDO/PGI in its own name; a protected indication, not necessarily an appellation | Review: region or appellation | Low | Unresolved |
| Q1384248 | Ribera del Queiles PGI | P | PDO/PGI in its own name; a protected indication, not necessarily an appellation | Review: region or appellation | Low | Unresolved |
| Q1569384 | Rioja | A | DOC only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q2167339 | Rosette AOC | N | AOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q7420081 | Santarém (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q55632668 | Schilcherland DAC | N | DAC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q1938017 | Somontano | A | DO only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q3516298 | Tavira (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q3546429 | Távora-Varosa (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q544423 | Tierra del Vino de Zamora DO | N | DO in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q7818261 | Tomar (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q3532486 | Torres Vedras (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q3541228 | Trás-os-Montes (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q7909361 | Valdejalón PGI | P | PDO/PGI in its own name; a protected indication, not necessarily an appellation | Review: region or appellation | Low | Unresolved |
| Q2509282 | Valle de la Orotava | A | ES-phrase only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q7912581 | Valpaços (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q7928085 | Vidigueira (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q1067753 | Vinho Verde (DOC) | N | DOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q507055 | Vinsobres AOC | N | AOC in its own name | Candidate: kind = appellation | Medium | Unresolved |
| Q3560958 | Viré-Clessé | A | AOC only in an alias | Candidate: keep as region | Medium | Unresolved |
| Q131767653 | Waitaki Valley | A | GI only in an alias | Candidate: keep as region | Medium | Unresolved |
