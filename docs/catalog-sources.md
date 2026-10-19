# Reference catalog: source and licence ledger

Every source the catalog may hold is listed here before any of its data is
imported. `src/server/reference/sources.ts` mirrors this table. Its
`approvedForLookup` flag is the licensing decision: only approved sources are
used to complete label readings. Changing the flag needs a reviewed code change
that also updates this file.

Being publicly accessible doesn't make data reusable. A source is approved only
when its licence clearly permits our use: storing it, combining it with other
data, and showing it to users inside a commercial-capable app.

Terms were reviewed on 2026-10-19 from each publisher's published licence
pages. Direct fetches from this build environment were blocked by its network
policy, so the terms were read via search results of the official pages. Before
the first Production import, re-check each licence link below.

## Ledger

| Source | Status | Licence (data) | Images | Attribution | Share-alike | Redistribution | Access and limits | Update frequency |
|---|---|---|---|---|---|---|---|---|
| **Wikidata** (wikidata.org) | **Approved** for import and lookups | CC0 1.0 for all structured data | Not imported. Wikimedia Commons files carry their own licences (often CC BY-SA). | Not required. We credit it anyway in Settings ("includes data from Wikidata (CC0)"). | None | Unrestricted | Query Service: 60 s per query; a few concurrent queries per client; a descriptive User-Agent is required; HTTP 429 means back off. Weekly full dumps for bulk use. | Continuous edits. We take dated snapshots. |
| **Open Food Facts** (openfoodfacts.org) | **Isolated, not approved.** May be imported only with `--allow-unapproved`, into its own source partition, and is never used for lookups. | ODbL 1.0 (database); DbCL 1.0 (individual contents) | CC BY-SA 3.0, separate from the data. **Never imported.** | Required ("Contains information from Open Food Facts, made available under the ODbL") | **Yes.** A derivative database that is publicly used must be offered under ODbL. | Allowed under ODbL terms | API: about 100 product reads per minute and 10 searches per minute per IP, with a User-Agent identifying the app. Bulk: daily JSONL/CSV/Parquet exports. | Daily exports |
| **Vino Nota user confirmations** | **Approved, but recording is off by default** (`CATALOG_CONTRIBUTIONS` unset) | Internal | None (photos are never part of a contribution) | n/a | n/a | Internal only | Only via `npm run catalog:review`, which accepts an identity only when at least 3 users confirmed it identically | On operator review |

### Considered and excluded

| Source | Why excluded |
|---|---|
| Vivino, Wine-Searcher, CellarTracker, Wine Enthusiast, Decanter and similar | Proprietary databases whose terms prohibit scraping or reuse. Excluded. |
| Kaggle "wine reviews" and similar scraped datasets | Scraped from proprietary sites, so redistribution rights are unclear. Excluded. |
| Wikipedia article text | CC BY-SA, so share-alike would apply. Structured facts come from Wikidata instead. |
| US TTB COLA public registry | Public records, but there is no bulk API, and harvesting the search site would amount to scraping. Not used. Revisit only if TTB offers a bulk download. |
| EU eAmbrosia (geographical-indication register) | Promising for appellations. The Commission's reuse policy generally allows reuse with attribution, but the register's own terms weren't confirmed this session. **Unresolved, so not used.** |
| GeoNames | CC BY 4.0. Not needed: places come from Wikidata. |

## Decisions and open questions

1. **Open Food Facts (decision needed).** ODbL share-alike applies to a
   derivative database that is publicly used. Merging Open Food Facts rows into
   the same catalog that serves lookups could arguably make the whole catalog
   such a database. Until a decision is made, its data stays in its own source
   partition with `approvedForLookup: false`, and the import script refuses it
   without `--allow-unapproved`. Possible paths:
   - (a) Keep it as a separate, ODbL-licensed "produced work" with attribution,
     and publish that partition under ODbL if it is ever served.
   - (b) Don't use it.

   Its barcode coverage of wine is also thin, which lowers its value.
2. **Wikidata class ids.** `WIKIDATA_CLASSES` (winery, grape variety, wine
   region, appellation, wine) and the properties used haven't yet been checked
   against Wikidata from this environment. The fetch script checks every id
   against its expected English label and stops on any mismatch.
3. **Contributions.** Recording needs a privacy notice before it is turned on.
   Only these fields are stored, per user and identity:
   - producer, wine name, country, region, appellation, style;
   - where each field came from.

   Never stored: vintage, price, scores, notes or photos. Contributions are
   removed with the account and included in the account export.

## Update procedure

1. Run `npm run catalog:fetch-wikidata -- --out data/catalog/wikidata/<date>`.
   This writes SPARQL JSON and `manifest.json` with the retrieval time, row
   counts and query hashes. Snapshots aren't committed (`data/` is ignored).
2. Run `npm run catalog:import -- --source wikidata --dir <dir>`. This is a dry
   run: review the inserted / updated / stale / rejected counts.
3. Run the same command with `--apply` against a Preview or development branch
   first. Production needs `--allow-production` plus
   `CATALOG_CONFIRM_ENDPOINT=<endpoint id>`, and an approved change request.
4. Record the snapshot date and counts in the table below.

## Import log

| Date | Source | Target | Inserted / updated / stale / rejected | Approved by |
|---|---|---|---|---|
| none yet | | | | |
