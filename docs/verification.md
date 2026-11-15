# Verification

How Vino Nota is checked, and what each kind of check does and does not prove. Four places run checks, and a result
from one is never reported as a result from another.

| Where | What runs | What it proves |
| --- | --- | --- |
| **Local** | `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e`, and the GITCRAFT gate below | The code on this machine, against a local Postgres |
| **CI** (GitHub Actions, `verify`) | The same five commands on a clean runner | The commit, independently of anyone's machine |
| **Preview** (Vercel, per pull request) | A build of the branch | That the branch builds and deploys; nothing signed-in is checked there |
| **Production** (`https://vinonota.app`) | GITCRAFT `verify-live` and a signed-out smoke test | That the live site serves the released commit and loads cleanly |

Signed-in screens are verified locally and in CI only. Nothing here signs in to production or reads a production
journal: there is no test account in production, and creating one would write to the production database.

## The GITCRAFT gate

Vino Nota is server-rendered and sits behind sign-in, so it has no `index.html` and no static build folder.
`.gitcraft/evaluation.json` says so: GITCRAFT's production gate then measures the running app at a local URL instead of
a folder, and reads the icons, title and analytics tag from the page the app serves.

```bash
npm run build && npm run start -- -p 3100   # serve the app against a local database
npm run evaluation:seed                      # a fixed 12-wine journal for one throwaway local account
```

`scripts/evaluation-seed.ts` refuses any database that is not local and never touches an account that already has
wines. Its account (`evaluation@example.test`) and password are fixtures for a database on your own machine, the same
ones the e2e helpers use; they are not credentials for anything else.

With the app running, "Run GITCRAFT" plans against it. The departments run sandboxed with no network, so either allow
the port before starting Claude Code (`GITCRAFT_ALLOW_LOCAL_PORTS=3100`) or run the production from a shell
(`python3 -m production run <id>`).

What the gate runs: a smoke test at phone and desktop size, the icon check, preservation (no file deleted; CI, deploy
and secrets untouched), asset integrity and licences, the engineering standard, and a PIXELCRAFT before/after comparison
of seven screens at six viewports.

One smoke check cannot pass locally by design: the test browser blocks every host but the app's own, so the HaveAnApp
Pulse script is listed as **unverified** rather than loaded (loading it would send test visits to the real counter).
`verify-live` against production is what verifies it.

## Before/after exclusions

A PIXELCRAFT verify fails when a metric the baseline measured is no longer measured, unless the exclusion is written down
with its reason. Against the baseline taken before PR #30, two metrics no longer apply, both on one screen at one size:

| Metric | Screen and viewport | Why it no longer applies |
| --- | --- | --- |
| `controls.primary` | Compendium at 320 × 568 | The date filters used to overflow the page sideways. They now stack, which makes the filter form taller than the first screen at this size, so there is no filled action in the first viewport for the metric to sample. The Apply button is unchanged and one scroll away. |
| `mobile.thumb_reach` | Compendium at 320 × 568 | The same cause: the metric samples filled actions in the first viewport. |

They are passed to the verify as `exclusions` when comparing against that baseline. They are not in
`.gitcraft/evaluation.json`: a baseline taken after PR #30 never measured them, and GITCRAFT fails an exclusion that
matches nothing.

Three other metrics that PR #30's verify reported as lost were not legitimate exclusions and are measured again:
two (`spacing.evenness` on Atlas and Regions at 320 px) were dropped by a rounding bug in the verifier, fixed in
GITCRAFT; one (`layout.alignment` on Settings at desktop size) was dropped because the page had become a one-column
grid, and is measured again now that it is a flex column.
