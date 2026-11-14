# PR519-CI-F1-MIGRATION-FIXTURE-001 — the 0107 installation fixture against every later pending migration

Goal and attempt: PR519 CI finding F1, task `PR519-D3E5-CI-F1-FIX-F2-PROBE-001`, attempt 1 (a test-only repair; a new local candidate).  
Human owner / executor resource: Davide (owner); SAME Routing17 Claude Code implementation worker, session `session_01FGXfrGsUA6jNm3sxRoSro2`. No new role.  
Native session: none; no native, provider or account session is used.  
Starting worktree/commit: new worktree `/home/user/Sophia-inc04-ci-f1-migration-fixture-001`, new branch `inc04-ci-f1-migration-fixture-001`, at exact `d3e5ba9c88379f3e697f66681c1dfc29379640f4` (tree `be3ff5d5f3e1d85bc23143bfc2726ff71016d964`), with 0 status lines.  
Ending commit/tree and changed files: one normal signed commit, the sole child of d3e5ba9c, changing exactly two paths. Its identity is recorded in the external packet after signing.

## 1. ACK and plan (written before any code change)

**Lease.** Exactly two writable paths:
1. `apps/api/src/selection-observations.db.test.ts`;
2. this new handoff.

No SQL migration, schema, persistence, API, SDK, GEN, config, lock, artifact record, SOURCE_MAP or test-support change. F2 (`tests/integration/usage-provenance.test.mjs`) is read-only here; Host18 owns any change to it in another candidate. Native1's `805523a1` and Host18's C2A work are separate and untouched.

**The CI failure.**
- **Run:** operative PR run `43560069515` (`ci`, pull_request), head_sha `d3e5ba9c`, checkout of the test merge `1ee258a9` (REST tree `be3ff5d5`, equal to d3e's).
- **Job:** `132341593188`, "SQL, persistence and API on PostgreSQL 16". Phase `db` (`pnpm test:db`) failed: 2,014 of 2,015 passed, 1 failed.
- **Case:** `apps/api/src/selection-observations.db.test.ts:356`, "answers 503 for every role without 0107, then serves from the same app once the migrator applies it". The assertion at line 371:

  | | Value |
  |---|---|
  | expected | `[['0107','applied']]` |
  | actual | `[['0107','applied'], ['0108','applied']]` |

**Cause** (observed from the source blobs).
- The fixture migrates a database over a symlinked directory of the migrations below `0107`.
- It then runs the real migrator over the full current `db/migrations`.
- It asserts that only 0107 is newly applied.
- The test blob `8cfa6e3b` is unchanged since af82. B2's `0108_owner_runner_model_reports.sql` (blob `410c9bda`) is present from 9444 onward, so the full-directory upgrade also applies 0108.
- No production SQL failed: 0108 applied, and `test:sql` passed in the same job.

**Plan.**
- **Keep:**
  - the genuine before-0107 fixture (the real migrator over the `< '0107'` prefix);
  - the same running app;
  - the guard-marker checks;
  - 503 `projection_unavailable` for the editor and the viewer before the upgrade;
  - the genuine full-directory upgrade through the real migrator;
  - after it: the restricted viewer body and the editor's `selected` no-reading baseline.
- **Replace only the newly-applied expectation.** It becomes an exact, complete, ordered list derived from an independent filesystem inventory of `db/migrations` (the migrator's own `NNNN_slug.sql` name rule), relative to the before fixture:
  - already-applied rows must be exactly the prefix versions;
  - newly applied rows must be exactly every later version, in order, each `applied`;
  - today's pending set is asserted explicitly to begin with `0107` and `0108`.
- **No ceiling** (a future `0109` extends the expected list rather than breaking it). No `includes`, count-only or ignore-later shortcut, and the report is never copied as the expectation.
- **The comments** that said the migrator applies only 0107 are corrected to acknowledge later pending migrations.

**Checks.**
- Toolchain: Node 24.21.0, pnpm 11.7.0, umask 0022, frozen install.
- A new owned PG16 on 127.0.0.1:55535, created after a census.
- **Fail-before:** the new test bytes on unchanged d3e production would pass, so the fail-before is the **original** d3e whole file on a real PG16 with 0108 present. It must fail exactly as CI did: actual 0107+0108 against expected 0107.
- **Positive:** the whole file on the new bytes, every subcase kept.
- **Static:** format, lint, typecheck, contracts and artifact reproduction (the app bundle is untouched).
- **Release:** ONE signed commit, then EARLY, then ONE ordinary `pnpm check` (which excludes `*.db`; the focused DB run is the DB proof), then the owned cleanup, then FINAL, then HOLD.

## 2. Outcome

The 0107 installation case asserts the real upgrade exactly as it now runs.
- The before-0107 database (the real migrator over the `< '0107'` prefix) still answers 503 `projection_unavailable` to the editor and the viewer.
- The same running app's real migrator, over the full current `db/migrations`, then reports exactly:
  - every prefix version `already_applied`;
  - every later version `applied`, in order: today 0107 and then 0108.

  The expectation comes from an independent read of the directory, never from the report.
- After the upgrade the viewer gets the restricted body, and the editor gets `selected` (the no-reading baseline).
- A later migration (0109 onwards) extends the expected list instead of breaking it.

No production code, SQL, persistence, API, contract, config, lock or runtime byte changed.

## 3. Evidence

All on the owned PG16 16.15 on 127.0.0.1:55535, with Node 24.21.0, pnpm 11.7.0 and a frozen install.

| Check | Result |
|---|---|
| **Fail-before:** the original d3e test bytes (`8cfa6e3b`), whole file, with 0108 present | **tests 4, pass 3, fail 1, exit 1**. The installation case fails at the old assertion: actual `[['0107','applied'],['0108','applied']]` against expected `[['0107','applied']]`, exactly as CI job 132341593188 failed. |
| **Positive:** the new bytes, whole file | **tests 4, suites 2, pass 4, fail 0, skipped 0, exit 0**. The three "scoped readings through the real preview (0107)" cases and the installation case all pass. |
| `pnpm format:check`, `lint`, `typecheck`, `contracts:check` | each exit 0 |
| `pnpm build`, `pnpm artifacts` | 0, 0; all 8 identities `match`, with no record |

The DB file is outside `pnpm check` (`!(*.db|*.live)`). These focused runs are its DB proof. The ONE ordinary on the signed head and the cleanup are reported in the external packets.

## 4. Decisions and changes

- **The fixture.** The `< '0107'` prefix construction is kept as the genuine before-0107 database. The test only records which files it linked.
- **The expectation.** It is the full ordered report (prefix `already_applied`, then everything after it `applied`), derived from the directory with the migrator's own `NNNN_slug.sql` rule.
- **Today's state, explicitly.** The pending upgrade is asserted to start with `0107` and then `0108`.
- **Not used:** no `includes`, no count-only check, no ignoring of later migrations, and no copying of the report into the expectation.
- **Comments.** The header and the in-test comment now say the upgrade applies 0107 and every later pending migration.
- **Unchanged:** the case title, every other assertion and every subcase.
- **Authority.** No new authorization was used, and nothing goes beyond the two leased paths.

## 5. Remaining obligations

- **F2** (the CI runtime-unit `usage-provenance` partial-installation failure and the hang until the 30-minute job limit) is not addressed here. My outside-source probes did not reproduce it, and its cause is unknown. Host18 owns that test in its own candidate.
- **The owned PG16 on 55535** is stopped normally after the ordinary, with its data and 0600 credential retained.
- **Still open:**
  - this candidate's own CI and review;
  - d3e's failed CI run 43560069515 (SQL F1 and runtime-unit F2), which stays failed;
  - GOV, SEC null, Luis/EdX2C, RTA, the native owner routes, deployed authorization and the app, and Personal 9e;
  - the 8c default-off catalog with its erratum, and the 9ed call-ending and draft-loss disclosure with cancellation, which are unchanged.

## 6. Next bounded action

Root reviews this local candidate's EARLY and FINAL. No publication, push, PR metadata change, comment, CI action or merge is taken or implied here.
