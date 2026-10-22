<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Vino Nota conventions

- Data access lives in `src/server/*`; every function takes the signed-in user's id first and scopes queries by `owner_id`. Never query user data from components directly.
- Pure, client-safe logic (analytics, validation, vocabularies) lives in `src/lib/domain`. Analytics must stay deterministic and fixture-tested.
- Styling uses the tokens in `src/app/globals.css` and CSS Modules; don't introduce raw colours or spacing values.
- Missing values are never zero: unrated scores are `NULL`; un-assessed sensory dimensions have no row.
- Schema changes: edit `src/server/db/schema.ts`, then `npm run db:generate` and commit the SQL in `drizzle/`.
- Gate before pushing: `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`.
- Design guardrails (type, icons, layout, colour, motion, copy) are in `CLAUDE.md`; every UI change must meet them.
