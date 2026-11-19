# INC04-R07-COHERENT-011-001: attempt 1

Goal and attempt: INC04-R07-COHERENT-011-001, attempt 1 (Root130, StageA). A LOCAL, bounded repair of ONE historical
migration fixture on the frozen coherent-010 source. It is not acceptance of coherent-010 or of INC-04.

Human owner / executor resource: Davide (repository owner); a Claude Code cloud session (Routing17,
`https://claude.ai/code/session_01FGXfrGsUA6jNm3sxRoSro2`) as the one implementation writer.\
Native session: not applicable to this session.\
Starting worktree/commit: new `/home/user/sophia-r130-coherent-011` on new `refs/heads/inc04-r07-coherent-011-001` at
`90a0af7eb3d4d376e9a0d63c0e05def18ee79b36`.

- **Merge:** `git merge --no-ff --no-commit 9495c87f… 9dfeba7f…`: rc 0, prospective ordered parents
  `[90a0af7e, 9495c87f, 9dfeba7f]`.
- **Materialization:** the 94 predecessor paths, copied from the sealed coherent-010 StageA source.
- **Equality check:** before any edit, the whole tree equals the frozen predecessor
  `2682f0fe3b1eea8caa0e680114d4d605435023da` (4343 leaves).

Ending commit/tree and changed files: an UNCOMMITTED StageA tree. See Evidence.

## States, before the edit

### The failure being repaired

- **Run:** coherent-010's full DB run (2199 tests, 2198 pass, 1 fail), at `apps/api/src/selection-exposure.db.test.ts:1022`.
- **The test:** "off serves 0107 without 0114; on is unavailable until the migrator applies it, then serves".
  - It installs every migration before 0114 into its own directory.
  - It then upgraded by migrating the WHOLE `db/migrations` directory.
- **Why it failed:** that directory now also holds 0115, so the migrator applied 0114 and 0115. The exact one-row
  assertion `[['0114','applied']]` failed.
- **What did not run:** the test's later restricted-viewer and never-bound byte-identical checks.

### The repair (only this)

- **Keep:**
  - the initial directory (only `.sql` files before 0114);
  - the initial migration;
  - the OFF-eligible and ON 503 guards.
- **Then, and only then:** add the exact existing `0114_capacity_exposure_custody.sql` to that SAME directory with the
  existing symlink pattern, and call the normal `migrate(empty.ownerUrl, dir)` under the same cluster lock.
- **Unchanged:** every assertion is unchanged, including the exact one-row report, and no timeout is touched.
- **Scope:** 0115 stays in the repository; only this historical fixture targets 0114.
- **Not changed:** imports (all three helpers are already imported), production migrations, the migrator,
  app/readiness, contracts, the runtime record, the Map and Studio.

### Expected outcomes (derived, not yet run)

| Check | Expected |
| --- | --- |
| Historical case | report `[['0114','applied']]`; restricted viewer; EDIT ON body byte-identical to OFF |
| Older-helper case | ON 503 without the key, OFF eligible, restored, then eligible |
| Whole owning file | every suite passes, including coherent-009's three HTTP tie cases and the W1 cases |
| Statics | format, lint and typecheck 0; `pnpm artifacts` 8 of 8 with nothing recorded (no bundle input changes) |
| Final inventory | 4344 leaves; exactly two paths differ from `2682` (the test and this handoff) |

### Limits that stay

- **Not reused as passes:** the coherent-010 full-DB failure and the Studio incomplete/failed run.
- **Due later:**
  - the full current SQL and DB, including the ordered 0113 → 0114 → 0115 path;
  - the three real crossings;
  - all 2724 Studio cases.

  These belong to a later canonical ordinary on an accepted local commit.
- **Gap:** `pnpm check` itself runs neither `test:sql` nor `test:db`.

## Evidence

Completed after the checks. The physical run bound the states-first version of this file (blob `c1a667af`).

### Composition and edit

- **Merge:** rc 0; 60 staged paths, parents `[90a0, 9495, 9dfe]`; no new objects.
- **Materialization:** 94 of 94 bodies, modes matching.
- **Equality:** the pre-edit tree serialized from my own temporary index equals `2682f0fe…` (4343 leaves). The real index
  was not serialized.
- **Edit:** the test went from `7fd44416` to `83288d0f` at line 1021 only. After the two guards it adds exactly
  `0114_capacity_exposure_custody.sql` to the fixture's own `dir` (existing `symlinkSync(join(...))` pattern) and runs
  `migrate(empty.ownerUrl, dir)` under the same lock.
  - Its local name avoids shadowing the file's `custody()` helper.
  - No import, assertion or timeout changed.

### Statics

- Frozen install: rc 0, lock `8c1ed766` unchanged.
- Toolchain, format, the repository's type-aware lint, build, typecheck and contracts: all 0.
- **`pnpm artifacts`: 8 of 8, none recorded.**

### Owned PG16 on 55649

- **Setup:**
  - two clean censuses;
  - postmaster pid 3874, start ticks 32626;
  - 8 of 8 auth and census expectations;
  - the positive identity check first, then four probes each returning 70.
- **Canary:** exit 7 on the wrapper handle: internal 7, caller 7, tool 7, harness 7.
- **Full owning file** `apps/api/src/selection-exposure.db.test.ts` through `node scripts/with-postgres.ts node --test
  --test-concurrency=1` (internal 0, caller 0, tool 0, harness 0): **12 tests, 3 suites, 12 pass**, 0 fail, cancelled or
  skipped.
  - The historical case passed: the exact one-row report, the restricted viewer, and the byte-identical never-bound
    preview, which never ran on coherent-010.
  - The older-helper case and coherent-009's three tie cases pass.
- **Pins:** equal before and after.
- **Stop:**
  - Readers absent and 0 clients; the probes returned 70.
  - ONE guarded stop: inner 0, caller 0, status 3, reaped on poll 3.
  - No listener, socket or pidfile remains. Data, logs and secrets are retained.
- **Monitor:** 26 samples, 0 unknown, 0 events; minimum free space 19.69 GB.

### Not done here (stays due)

- The full current SQL and DB (0113 → 0114 → 0115) and the three real crossings.
- All 2724 Studio cases.

The coherent-010 full-DB failure is NOT reused as a pass.

## Remaining obligations

- SAME independent whole final SOURCE_CORE review of this StageA.
- Then a local commit and ONE canonical cold ordinary that includes the full SQL and DB, the full Studio shards, and the
  GOV, Luis, RTA, deployment and application gates.
- All holds remain.

## Next bounded action

HOLD for the SAME whole final SOURCE_CORE review.
