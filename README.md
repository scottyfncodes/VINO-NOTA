# Vino Nota

A private, iPhone-first wine field journal by HaveAnApp. Photograph a label, confirm the wine's identity, record a tasting with a personal score out of 10, and build a searchable archive whose charts are drawn only from what you have actually recorded.

*Editorial beauty with scientific rigour.*

## What's in V1

| Area | What it does |
| --- | --- |
| **Atlas** (`/`) | Headline figures (wines, tastings, regions, mean rating with its sample size), recent tastings with label photos, highly rated wines, and one evidence-backed insight when there's enough data — otherwise an empty state that explains how to begin. |
| **Journal** (`/journal`) | Search across wine, producer, vintage, grape, region, appellation, descriptors, tags and notes. Sort by date, rating, name or price; filter by type, country, region, grape, score range and date range. List and grid layouts, tasting and wine views. |
| **Capture** (`/capture`) | Camera or library photo → optional label recognition → review/correct identity → match an existing wine or create a new one → record the tasting → save. Manual entry always works. Drafts autosave on the device. |
| **Wine record** (`/wines/[id]`) | Photos, identity with per-field provenance, every tasting kept separately, related wines from the same producer, duplicate detection and merge, edit, "taste again", export, and confirmed deletion. |
| **Compendium** (`/compendium`) | Rating distribution, palate fingerprint, price vs. enjoyment, and tasting chronology — each with sample sizes, a text summary, a table view and filters. |
| **Regions** (`/regions`) | A country-level map (Natural Earth outlines) and a country → region → sub-region/appellation index. Regions are not pinned on the map because no verified coordinates exist for them. |
| **Settings** (`/settings`) | Default currency, JSON/CSV export, sign-out, account deletion. |

## Architecture

- **Next.js 16** (App Router, TypeScript, Turbopack). Server Components for pages; Server Actions for mutations; Route Handlers for uploads, private images, recognition and exports. Cache Components is deliberately off: nearly every screen is private and per-user.
- **PostgreSQL + Drizzle ORM** with SQL migrations in `drizzle/`. Foreign keys cascade so deleting a wine or an account leaves nothing orphaned; check constraints enforce score range (0–10), price ⇒ currency, vintage/NV consistency, observation status rules, and coordinate provenance.
- **Better Auth** (email + password) with database-stored sessions in HTTP-only cookies and database-backed rate limiting in production.
- **Private image storage**: Vercel Blob with `access: "private"`. Photos are decoded and re-encoded server-side with `sharp` (EXIF — including GPS — stripped, orientation applied) into original/display/thumbnail derivatives and are served only through `/api/images/[id]` after an ownership check.
- **Charts**: Recharts for the distribution, scatter and chronology; a custom SVG dot-matrix for the palate fingerprint; a server-rendered `d3-geo` map. Chart palettes were checked for colour-vision-deficiency separation and contrast in light and dark modes.

```
src/
  app/                 routes: (auth) sign-in/up, (app) screens, api/ handlers, actions.ts
  components/          ui/ design-system primitives, shell/, capture/, wine/, journal/, charts/, regions/, atlas/
  lib/domain/          pure, client-safe domain logic: analytics, validation, sensory lexicon, scores, normalisation
  server/              data access layer — every function takes the signed-in user's id and scopes by owner
    auth/ catalog/ tastings/ journal/ analytics/ images/ storage/ recognition/ export/ account/ db/
drizzle/               SQL migrations
tests/unit             domain logic and analytics against known fixtures
tests/integration      real-Postgres tests: CRUD, multi-tasting, merge, isolation, images, export, deletion
tests/e2e              Playwright: capture → save → journal → analysis → export, navigation, isolation, deletion
```

### Data model

`wine` (canonical identity, owner-scoped) ← many `tasting` (one occasion each) ← many `sensory_observation` and `tasting_tag`. Supporting tables: `producer` (with aliases), `region` (hierarchical, optional coordinates that require a stated source), `wine_grape` (variety + share), `wine_image`, `metadata_source_record` (raw provider output for provenance), `user_preferences`, plus Better Auth's `user`/`session`/`account`/`verification`/`rate_limit` and `provider_usage` for recognition rate limiting.

Key rules:

- A missing score is `NULL`, never `0`, and is excluded from score statistics.
- A sensory dimension with no row is **not assessed**; `unknown`, `absent` and `not_applicable` are explicit statuses that can't carry a value.
- Every wine field records whether it was entered by the user or suggested by a provider and confirmed by the user (`field_provenance`).
- Prices keep their currency and a basis (retail bottle / restaurant bottle / glass); analytics never convert or mix currencies.
- Internal UUIDs are the stable identifiers; external ids are optional metadata.

## Label recognition

Recognition sits behind the `LabelRecognitionProvider` interface (`src/server/recognition/types.ts`). The included provider uses Claude vision through the Anthropic SDK and activates only when `ANTHROPIC_API_KEY` is set. It returns:

1. the text it could read on the label,
2. a candidate identity with per-field confidence, and
3. photo issues (glare, blur, partial label, multiple vintages, …).

Confident fields (≥ 60%) are pre-filled and badged; uncertain ones are offered as suggestions. If any provider value is used, the user must tick a confirmation before continuing, and provenance is stored with the wine. Without a key, Capture says recognition isn't set up and proceeds with manual entry. No results are ever simulated. Recognition is limited to 30 requests per user per hour.

## Local development

Requirements: Node 20.9+, PostgreSQL 15+.

```bash
cp .env.example .env.local     # set DATABASE_URL and BETTER_AUTH_SECRET
cp .env.local .env             # drizzle-kit / scripts read .env
npm install
npm run db:migrate
npm run dev
```

Without a Blob store configured, photos are stored under `./.data/storage` in development.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test                       # unit + integration (needs TEST_DATABASE_URL or the default local test DB)
npm run build
npm run test:e2e               # builds must exist; starts `next start` on :3100
```

The integration suite rebuilds the test database from the committed migrations on each run.

## Deployment (Vercel)

- `vercel-build` runs `scripts/migrate.ts` before `next build`, so each environment migrates **its own** database. The script logs the target (`env`, Neon endpoint id, database name; never credentials).

### Preview / Production database isolation

| Environment | Neon branch | How it gets `DATABASE_URL` |
| --- | --- | --- |
| Production | `main` (`ep-winter-glade-b7ewqow0`; the Vercel integration blocks deleting the branch or its read-write endpoint; Neon's own branch protection is not enabled) | Project-level variable from the Neon integration |
| Preview | `preview/<git-branch>`, forked from `main` | Injected per deployment by the Neon integration |

The Neon project is `neon-sky-pocket` (`twilight-paper-99193935`), connected through Vercel's Neon integration. Its per-deployment branching should be on for **Preview only**: Production must keep using `main`.

The project-level `DATABASE_URL` is also targeted at Preview, so a Preview would fall back to Production if per-preview branching ever stopped working. `src/server/db/target.ts` prevents that: when `VERCEL_ENV=preview`, both the migration script and the runtime client refuse to connect to Production's endpoint. The guard fails closed: a Preview is refused if `PRODUCTION_DB_ENDPOINT_ID` (set for Preview only) is missing or differs from the endpoint committed in `PRODUCTION_ENDPOINT_ID`, or if the host is unrecognisable. So if Preview branching is switched off, Preview builds fail instead of migrating Production.

Preview branches are forked from Production, so they start with a copy of Production data as of the fork. Preview deployments sit behind Vercel Authentication.
- Required environment variables: `DATABASE_URL`, `BETTER_AUTH_SECRET`, and a private Blob store (`BLOB_STORE_ID` with Vercel OIDC, or `BLOB_READ_WRITE_TOKEN`). Optional: `ANTHROPIC_API_KEY`, `RECOGNITION_MODEL`, `BETTER_AUTH_URL`, and `RESEND_API_KEY` + `EMAIL_FROM` for password reset.
- Security headers (HSTS, `nosniff`, frame denial, referrer and permissions policies) are set in `next.config.ts`.

## Known limitations

- **Email is only used for password reset**, and only when `RESEND_API_KEY` and `EMAIL_FROM` are set; otherwise "Forgot your password?" is hidden. Reset links work once, expire after an hour and sign the account out everywhere. Sign-up also sends a confirmation link (24 hours; resend from Settings). Confirmation is informational: an unconfirmed address can still sign in. With Resend's test sender (`onboarding@resend.dev`), mail reaches only the Resend account owner's address; use a verified domain before inviting others.
- **No external wine metadata source**: "candidate matches" come from the recognition provider and from the user's own journal; there is no retail/catalogue database.
- **Regions are not geocoded**: the map shades countries only. The schema supports region coordinates, but they are never inferred.
- **Small countries** (e.g. Malta) aren't drawn at the 1:110m map scale; they still appear in the index.
- Pages render a loading skeleton while streaming, so a missing or foreign record shows the "not found" view with an HTTP 200 status; private APIs (images, exports) return 404.
- Light theme is the primary design; dark mode follows the system setting and has no in-app toggle.
- The Anthropic recognition provider is implemented against the SDK's documented API but has not been exercised against the live API in this repository's test suite (no key is configured); its output normalisation is unit-tested.
