# Recovery runbook

What can be restored after a mistake in Production, and how. Verified on
2026-10-21 against Neon project `twilight-paper-99193935`.

## What is covered

| Data | Where | Recovery | Window |
|---|---|---|---|
| Database (accounts, wines, tastings, image records) | Neon branch `main` (`br-holy-tree-b7kxdd7v`, endpoint `ep-winter-glade-b7ewqow0`) | Point-in-time restore | 6 hours (Neon Free plan) |
| Database | Manual snapshot `snap-royal-morning-b7lbtx5u` (2026-10-21 15:46:24 UTC) | Snapshot restore | Until deleted. The Free plan allows one manual snapshot |
| Label photos | Vercel Blob store `store_5vcRWhk6ibbnPHUi` (private) | **None.** Blob has no versioning or backup; a deleted file is gone | — |

Users can download their own records from Settings (export), and their
original photos while signed in via `/api/images/{id}?size=original`.

Daily scheduled snapshots and a longer restore window need a paid Neon plan
(Launch: restore window up to 7 days, scheduled snapshots kept up to 35 days).

## Restore the database from the snapshot

Test first on a separate branch. **Never finalize a restore without a decision
to replace Production**: finalizing moves Production's compute onto the
restored data and loses every write since the snapshot.

1. Note the time, and Production's row counts and schema checksum.
2. Restore the snapshot to a **new** branch, not finalized:
   - Neon console → Backup & restore → the snapshot → **Restore → Multi-step restore**; or
   - API / Neon MCP `restore_snapshot` with `finalize: false` and no target branch.
     The MCP tool **defaults to `finalize: true`** for a new branch, so pass `false` explicitly.
3. Confirm Production is untouched (same branch, endpoint and counts).
4. Inspect the restored branch read-only (it gets its own compute).
5. Then either:
   - delete the restored branch (it holds personal data); or
   - to replace Production, finalize it (console, or `finalize_branch_restore`),
     and record the decision and the time.

Last tested 2026-10-21: restored to `restore-test-2026-10-21` with
`finalize: false`. All 25 table counts, the schema checksum, both migrations
and the user and image fingerprints matched Production; Production was
unchanged; the test branch was deleted.

## Restore to a point in time (last 6 hours)

Neon console → Backup & restore → choose a time → **Preview data** first, then
**Restore**. Neon keeps the previous state as `main_old_<timestamp>`. Use the
restore point (time and LSN) that the Production migration workflow logs
before applying a migration.

## Known gaps

- Photos have no backup.
- Only one manual snapshot is possible on the Free plan, so a pre-migration
  snapshot needs either a paid plan or replacing the existing one.
