# Wine reference catalog

A shared, read-only reference of wine places, producers, grapes and wines. Its
job is to complete label readings. It is entirely separate from users' private
journals: it has no owner columns, no app route writes to it, and journal
tables never reference it.

## Model (`src/server/db/schema.ts`, migration `drizzle/0001_catalog.sql`)

| Table | Holds | Key points |
|---|---|---|
| `catalog_source` | One row per source: licence, attribution, `approved_for_lookup`, `retrieved_at` | Lookups join on `approved_for_lookup` |
| `catalog_region` | Regions, subregions and appellations, with a parent hierarchy | Unique on (source, external id); trigram index on the normalised name |
| `catalog_producer` | Producers | Name normalised with `normalizeProducer`, so "Château X" and "X" match |
| `catalog_grape` | Grape varieties | |
| `catalog_wine` | **Wine identity**: producer + wine name, style, place | No vintage: a wine identity spans vintages |
| `catalog_wine_grape` | The grapes of a wine | Filled only from source data, never inferred |
| `catalog_product` | **Product listing**: barcode, volume, abv, and vintage or NV for one bottling | Barcodes are GTIN-validated and stored in EAN-13 form |
| `catalog_alias` | Name variants for any entity | Synced to exactly what each snapshot contains |
| `catalog_contribution` | User-confirmed identities awaiting review | Cascade-deleted with the user; included in their export |

Every record carries its source, external id, `confidence` (the source's trust
level: Wikidata 0.9, contributions 0.8, Open Food Facts 0.7) and
`last_verified_at`.

The migration is purely additive: `CREATE EXTENSION IF NOT EXISTS pg_trgm`
plus nine new tables. Neon supports pg_trgm. No existing table is altered.

## Lookup and recognition (`src/server/reference/lookup.ts`, `src/server/recognition/index.ts`)

The pipeline is: photo → Claude reads the label (one call, unchanged) →
`lookupCatalog` → `enrichFromCatalog` → the form is pre-filled → the user
confirms.

**Lookup bounds**
- One read transaction with `SET LOCAL statement_timeout = 1500`, and LIMITs of
  5 or fewer on every query.
- An in-memory LRU cache (500 readings, 10 minutes).
- Any error or timeout returns no evidence, and the label reading goes through
  unchanged.
- No extra AI calls are made.

**Matching**
- **Producer:** exact match on the normalised name or an alias (score 1),
  otherwise the best trigram similarity of at least 0.6. If several exact
  matches have different countries, the score is capped at 0.85, so the
  producer can't fill fields, and the country is cleared.
- **Place:** the appellation (or else the region) the label named. Matches are
  narrowed to the label's country. A place found in several countries is marked
  ambiguous and fills nothing.
- **Wine:** matched only among the wines of an exactly matched producer, never
  by name alone.

**Enrichment rules** (`src/lib/domain/catalog.ts`, fixture-tested)
- Only empty fields are filled. Where the label gave a value, the label's value
  is kept: agreements are counted, and disagreements are reported to the user
  as conflicts.
- **Vintage, non-vintage and alcohol are never taken from the catalog.**
- A score of 0.9 or more pre-fills the field with confidence
  min(score, source confidence) × 0.95. A score from 0.6 to 0.9 is only offered
  as a suggestion at confidence 0.5, which the user must accept (the form
  pre-fills at 0.6 or more). Anything below 0.6 is ignored.
- Grapes are filled only from a strong wine match.
- Country is filled only from an unambiguous place or an exact producer, and
  only when the two agree.
- Values filled from the catalog are tagged `catalog:<source>`. The form shows
  them with a "From catalog" badge, a note lists what the catalog filled and
  where it disagrees, and the saved provenance records the source, so the wine
  page shows "From catalog · confirmed".
- Manual entry is unchanged. The catalog never blocks or delays saving.

## Imports (`scripts/catalog/*`, `src/server/reference/import.ts`)

- `fetch-wikidata` writes a dated snapshot directory and verifies the class and
  property ids first.
- `import` is a dry run by default; pass `--apply` to write.
  - Validation (`validateBatch`) rejects records with a reason and drops
    duplicate external ids.
  - The whole source is upserted in **one transaction**, keyed on (source,
    external id), so re-running the same snapshot changes nothing.
  - Records missing from a newer snapshot are reported as `stale` and never
    deleted automatically.
- Writes are guarded:
  - Preview isolation (`assertPreviewIsolation`) applies.
  - Production is refused unless `--allow-production` and
    `CATALOG_CONFIRM_ENDPOINT=<endpoint>` are both given.
  - A remote database that can't be identified as non-Production is refused.
  - Unapproved sources need `--allow-unapproved`.
- **Recovery:** a failed import rolls back completely. Fix the cause and re-run
  the same command. To revert a bad snapshot, re-import the previous one, which
  restores names and aliases. Records it doesn't contain are reported as stale;
  delete them by hand only after review.

## Growth from users

When `CATALOG_CONTRIBUTIONS=on` (off by default, pending a privacy notice),
saving a new wine records the confirmed identity once per user. The record
holds the producer, name, country, region, appellation and style, plus where
each value came from. `npm run catalog:review` accepts an identity only when 3
or more users confirmed it with no disagreement. With `--apply`, it imports the
accepted identities under the `contributions` source, using the same guarded,
idempotent import. Nothing is published automatically.

## Cost and capacity

- No new services or paid infrastructure.
- Storage: a Wikidata snapshot of wine places, producers, grapes and wines is
  estimated at a few MB, including the trigram indexes. Neon's storage use is
  about 33 MB today.
- Per label scan: one cached, indexed read transaction (a few ms when warm,
  1.5 s at most). Claude usage is unchanged.
