# PR519-SELECTION-INSTALLATION-0109-FIXTURE-001 — the 0105-less historical fixture before C2A's dependent 0109

Goal and attempt: PR519 inherited verification fixture C2A-REPAIR-I01, task `PR519-SELECTION-INSTALLATION-0109-FIXTURE-001`, attempt 1. This is a test-only repair: a new local candidate.  
Human owner / executor resource: Davide (owner); SAME Routing17 Claude Code implementation worker, session `session_01FGXfrGsUA6jNm3sxRoSro2`. No new role.  
Native session: none; no native, provider or account session is used.  
Starting worktree/commit: new worktree `/home/user/Sophia-selection-installation-0109-fixture-001`, new branch `inc04-ci-selection-installation-0109-fixture-001`, at exact `7998e3a0d37bcfba3ac912648337dcf0529094e0` (tree `eb28e0a2f76f609724b08c9f23092f18d508e5e5`; it is CHANGES_REQUIRED, not accepted), with 0 status lines.  
Ending commit/tree and changed files: one normal signed sole child of 7998e3a0, changing exactly the two paths below. Its identity is recorded in the external packet after signing.

## 1. ACK and plan (written before any test edit)

**Inputs.** Context zip `b34988a4…7fcf` (74,227 B), with all 8 SUMS lines OK and no unsafe members. TASK `411f6d55…6a11`, read in full, together with SOURCE-BINDINGS and the C2A repair CORE (`372c` tree, CHANGES_REQUIRED), including its I01 fixture-failure record.

**The supplied bodies equal the 7998 blobs exactly:**

| Path | Blob |
|---|---|
| `selection-installation.db.test.ts` | `65f917ed` |
| `0105_contribution_atomic_admission.sql` | `e9c00ed0` |
| `0109_research_call_evidence.sql` | `eaa88349` |
| `migrate.ts` | `1dd20b8d` |
| `contribution-installation.ts` | `86da16e5` |

The supplied bodies are inert; no received script is executed.

**Lease: exactly two writable paths.**
1. `apps/api/src/selection-installation.db.test.ts`, base blob `65f917ed8e2ba0ea888a9d2498acf912e565d4e4`;
2. this NEW handoff.

No production, SQL, GEN, SOURCE_MAP, SDK, lock, profile or config write. No C2B code, GEN or IDs. The a89 `selection-observations` file is not touched.

**Read scope:** this test file and the bound migrator, guard and migration bodies; no broad survey.

**The cause** (CORE I01; source lines 574–580 and 690–714).
- `allBut('0105')` links every other migration in the tree, now including `0109_research_call_evidence.sql`.
- 0109's declarations use `sophia.api_contribution_claims`, which 0105 creates.
- So both missing-0105 suites fail (42704) in setup, before their intended API, readiness, refusal and real-upgrade assertions.
- On unchanged 7998 the file alone gives 14 tests, 9 pass, 5 cancelled, exit 1.

**The plan.**
- **Fixture.** Model the genuine historical database: the earlier source **before 0109** (0001–0108) with 0105 omitted, and 0106, 0107 and 0108 installed from their exact bytes. A new explicit-boundary helper replaces `allBut`. The dependent 0109 is never run in the 0105-less state.
- **Kept unchanged:**
  - missing-core refusal, with the flag on and off;
  - readiness;
  - the contribution routes and the preview;
  - maintained admission and the runtime paid reserve refused before their SQL;
  - the old-SQL positive controls;
  - the same running instances after the upgrade;
  - the owned-client teardown fences.

  No assertion is weakened, removed or skipped.
- **Real upgrade.** Derive every pending migration and its hash from `readMigrations` (the current directory) minus the initial ledger, not "only 0105" and not a hardcoded total. Then assert:
  - the exact applied list, explicitly beginning with 0105 and including the dependent 0109 today, with no ceiling;
  - the already-applied rows exactly equal to the initial ledger;
  - every pending version's recorded checksum equal to its file;
  - 0106's recorded checksum and the `selection_snapshot` definition unchanged;
  - every original positive and negative invariant afterwards.
- **Checks.**
  - Owned NEW PG16 on 55543 at `/var/tmp/selection-installation-repair-pg55543/{data,log,sock,secret}`, after a free/new census. Older clusters (55535, 55537, 55539, 55541) and sealed directories are not touched.
  - Node 24.21.0, pnpm 11.7.0, frozen offline install, umask 0022.
  - `pnpm build` and `pnpm artifacts` (verify only; all 8 identities must match, with no record).
  - **Before-control:** the unchanged 7998 file, to reproduce setup 42704. **After-control:** the whole new file.
  - format, lint and typecheck. Each command's actual inner exit is recorded, then the caller's exit.
- **Then:** ONE normal signed local sole-7998 commit (stopping on any automatic approval rejection), EARLY, ONE ordinary on the clean head, guarded own-PG cleanup, FINAL, then HOLD.
- **Effects:** no push, PR, comment, CI, merge, deploy, flag, provider, native or voice effect.

## 1b. Additive ACK and plan: the worker test path (written before any edit to it; §1 unchanged)

**Input.** The worker extension zip `6acb2646…7e44` (7,417 B). All 3 SUMS lines are OK and no member is unsafe. TASK-EXTENSION and BINDING were read in full.

**Binding.** `apps/worker/src/contribution-installation.db.test.ts` at parent 7998e3a0, blob `967cab0f7788c03520a8066a207c1e1aba338964` (13,093 B, sha256 `12c80877…3f09`). The supplied copy equals the 7998 blob.

**The lease becomes EXACTLY three paths:**
1. the API `selection-installation.db.test.ts`;
2. the worker `contribution-installation.db.test.ts`;
3. this NEW handoff.

That is two modified tests and one new handoff. The parent, worktree, branch and owned PG 55543 are the same. There is still no other writer, and no source, SQL, GEN, SOURCE_MAP or SDK permission. No test had been edited when this was written.

**Worker cause.** Its fixture links all migrations except 0105 (lines 51–55), which now includes the dependent 0109, so setup fails. Root reports the paired negatives as 0/6 (1 fail, 5 cancelled), exit 1.

**Plan.**
- **Fixture.** Replace only the invalid historical setup with the valid pre-0109 history minus 0105, keeping 0106 and the current historical prerequisite bytes. Update the historical comments to be accurate.
- **Kept, all five worker behavior cases and their lifecycle:**
  - mixed cleanup dispatched while new work is held, with no command or reservation;
  - real DB-clock lease expiry, and `outcome_unknown` reconciliation;
  - no resend of an existing command;
  - the bounded real dispatcher loop;
  - the same held row dispatched after the actual 0105 installation. That case installs 0105's SQL directly for the old-SQL lifecycle, which stays distinct from the API test's real-migrator all-pending ledger proof.
- **Not allowed:** no weakening, skips, timing shortcuts, or new payer or provider support. The owned-client cleanup and the original database ending are kept.
- **Checks.** Fail-before on unchanged 7998 for both files; then both whole files on the new bytes, with real counts and inner then caller exits; then the normal static checks. Then ONE signed commit of exactly 3 paths (stopping on any automatic approval rejection), EARLY, ONE ordinary, cleanup, FINAL, HOLD.

## 1c. Additional finding in the same worker path: teardown after a partial setup (recorded after the fixture edits)

**Received:** root's finite finding from the independent review `77dd79e6`, after both fixture edits had been made. The teardown edit below was made before this section was written; there is no earlier ACK for it. The lease is unchanged (the same three paths).

**The old fault (observed).** On 7998, when the worker file's setup fails, its file-level `after` reads `api.end()` on a pool setup never created. The run then reports a second failure, `TypeError: Cannot read properties of undefined (reading 'end')` at `contribution-installation.db.test.ts:61:13`, in addition to the setup error, and nothing after that line runs. Both 7998 worker logs show it:
- the cascade run (`02`);
- the isolated run (`05`), where the setup error is the 0109 42704.

**The repair, in this test file only.**
- Teardown now acts only on what setup actually made:
  - the pools it opened, in the same order (`api`, `worker`, `owner`), recorded as each is created;
  - a database drop, recorded only once `createTestDatabase` returned;
  - the linked directory, recorded only once it was made.
- Every existing pool is still ended before the database it uses is dropped, and each `end()` or `drop()` failure still propagates: nothing is caught or ignored.
- No shared teardown framework, helper, production code or cluster or role workaround is involved. The five behavior cases are unchanged.

## 2. Outcome

- **API.** Both missing-0105 suites now build the genuine earlier source: this tree's migrations before the explicit `EARLIER_BOUNDARY` `0109`, without 0105, with 0106, 0107 and 0108 at their exact bytes (`earlierWithout`, which replaces `allBut`).
  - All 14 cases run and pass. That covers the refusals with the flag on and off, readiness, the contribution routes and the preview, the maintained admission and the paid reserve refused before their SQL, the old-SQL positive controls, the same running instances after recovery, and the teardown fence.
  - The real-migrator upgrade now asserts the following, each derived from `readMigrations` and the initial ledger:
    - the initial ledger is exactly the earlier source;
    - the pending set begins with `0105` and includes `0109`, with no ceiling;
    - the whole ordered report: recorded migrations `already_applied`, every pending one `applied`;
    - every recorded checksum is kept, and every pending checksum equals its file;
    - 0106's checksum and the `selection_snapshot` definition are unchanged.

    The original post-upgrade invariants are all kept.
- **Worker.** The same historical fixture. All five lifecycle cases pass, including the dispatch of the same held row after the actual 0105 SQL is installed directly (distinct from the API's real-migrator proof). After a setup failure, teardown reports only that failure.

No production, SQL, GEN, SOURCE_MAP, SDK, lock, profile or config byte changed.

## 3. Evidence

All runs use the owned PG16 on 127.0.0.1:55543, Node 24.21.0, pnpm 11.7.0, a frozen offline install and umask 0022. Each line gives the inner exit, then the caller's.

| Check | Result |
|---|---|
| **Fail-before, API, 7998 bytes** (`65f917ed`) | tests 14, pass 9, cancelled 5, inner 1 / caller 0. Both coherent suites fail in setup: `0109_research_call_evidence.sql failed and was rolled back: type "sophia.api_contribution_claims" does not exist` (42704). In the same run, the teardown-fence suite then failed with 42501 (`sophia_conversation_assembler exists with privileges or objects of its own`), a cascade from the leftover database noted below. |
| **Fail-before, worker, 7998 bytes** (`967cab0f`), after the API run | tests 6, fail 1, cancelled 5, inner 1. The setup failed with the **42501 cascade**, not its own cause, because the API run left `sophia_u_52e8a5c3f580` in the cluster. Kept as recorded. |
| Leftover database | That one leftover database was dropped `WITH (FORCE)` in my own cluster. Roles were untouched. |
| **Fail-before, worker, alone** | tests 6, fail 1, cancelled 5, inner 1 / caller 0. Its own setup cause: 0109 42704. Then the teardown `TypeError … reading 'end'` at 61:13 (§1c). |
| **After, API, new bytes** | tests 14, suites 8, pass 14, fail 0, cancelled 0, skipped 0, inner 0 / caller 0 |
| **After, worker, new bytes** | tests 5, suites 1, pass 5, fail 0, cancelled 0, skipped 0, inner 0 / caller 0. Only the three default databases remain afterwards. |
| **Adverse partial setup, worker, new bytes** | `SOPHIA_DISPOSABLE_DATABASE_URL` pointed at closed 127.0.0.1:1, so setup fails before any handle exists. tests 5, cancelled 5, inner 1. The only error is `ECONNREFUSED 127.0.0.1:1`, with **0 TypeError**. |
| `pnpm format:check`, `lint`, `typecheck` | inner 0 each / caller 0 |
| `pnpm build`, `pnpm artifacts` | inner 0 / 0. All 8 identities `match`, with no record. |

**Not exercised by a run:** a real `end()` or `drop()` failure after a partial setup. That propagation rests on the code (sequential awaits, no catch), not on a run.

## 4. Decisions

- **The boundary.** One explicit constant per file, `0109`: the first migration that declares on 0105's objects. It is not "the whole tree but 0105".
- **The upgrade expectation.** Built from the directory plus the initial ledger, never copied from the report. It has no hardcoded total and no ceiling, and it uses no `includes` shortcut for the applied list (`includes` only names today's dependent 0109).
- **The worker teardown.** Fixed only in this file, with the tracking local to it. Its order and failure visibility are unchanged.

## 5. Remaining obligations and findings

- **Open finding, API file (observed effect plus a code reading; not repaired here).** The API suites' `after` hooks have the same partial-setup shape.
  - The upgrade suite's `after` begins with `on.close()`. When its `before` fails at `migrate`, `on` was never created, so `empty.drop()` is never reached.
  - That is consistent with the leftover `sophia_u_52e8a5c3f580` observed after the 7998 API run, and with the 42501 cascades that followed it.
  - node:test did not print that teardown error, because the suite had already failed.
  - With the fixture repaired, that path no longer runs here. Repairing it is root's call; it is not covered by the worker finding.
- **Process erratum (kept).** The `ss` port guard did not run before the PG start (`ss` is not installed). The listener is bound by `/proc` identity instead, so there is no pre-start free-port proof.
- **Still open:**
  - a89's `selection-observations` all-pending repair (a separate join, untouched);
  - C2B (sealed, read-only);
  - 7998's CHANGES_REQUIRED;
  - GOV, SEC null, Luis/EdX2C, RTA, native, the deployed app, Personal 9e, 8c with its erratum, and 9ed.

## 6. Next bounded action

ONE signed local commit of exactly these three paths, then EARLY, ONE ordinary, the guarded own-PG cleanup, FINAL, then HOLD. No push, PR, comment, CI, merge or deploy.

## R1. ACK and plan: the complete C15 cleanup batch (written before any R1 test edit; everything above is c15's text, unchanged)

**Task.** `PR519-SELECTION-INSTALLATION-0109-FIXTURE-001` R1, the same SAME Routing17 worker, session `session_01FGXfrGsUA6jNm3sxRoSro2`.

**Inputs.** The context zip is `99ef8e91…02aa` (15,929 B). All 3 SUMS lines are OK. Read in full:
- `TASK.md` `f2de8960…580e`;
- `BINDINGS.json` `6a8d82ff…35b4`;
- CORE `INSTALLATION-FIXTURE-C15-WHOLE-SOURCE-CORE-001` `5a56e958…2b84` (CHANGES_REQUIRED, C15-F01/F02).

**Identity.**
- New worktree `/home/user/Sophia-selection-installation-0109-fixture-001-r1`, new branch `inc04-ci-selection-installation-0109-fixture-001-r1`.
- Exact parent `c15ec10735e930ec6e63ea7d4251df9e41bdeae5` (tree `05a25474…`), with 0 status lines.
- The three bound paths equal BINDINGS:

  | Path | Mode | Blob | Bytes |
  |---|---|---|---|
  | API test | 100644 | `804162b6` | 46,933 |
  | worker test | 100644 | `0af45943` | 14,101 |
  | this HDF | 100644 | `caeb6d49` | 14,098 |

- The other 4,253 leaves equal c15's.
- c15, its ONE ordinary (`bu79oq6yk`, runner 3015) and its PG 55543 are not touched by R1. That run finishes and is cleaned up and reported separately.

**Lease: the same exactly three paths.** The API test, the worker test and this HDF, which is appended only (c15's text stays an exact byte prefix). There is no production, SQL, GEN, SOURCE_MAP, SDK, lock, profile or config write, no C2B ID or source, no new dependency, and no shared framework. Every other path is read-only.

**Read scope:**
- both test files;
- test-support `database.ts`, for the `createEmptyDatabase`/`createTestDatabase` lifecycle and the cwd-relative default `db/migrations`;
- `migrate.ts`;
- the pinned pg/pg-pool semantics already cited by the E62 fence (SOURCE_MAP §2r), which is not re-audited.

**C15-F01 (API).** One local registry of what a setup actually acquired, used by all six after-hook patterns (eight suite instances).
- **Registration.** Each resource is recorded the moment it exists:
  - an app as soon as it is built;
  - each pool through `owned()` before first use;
  - the owner pool;
  - a login role right after its `CREATE ROLE` returned;
  - the `EmptyDatabase` or `TestDatabase` before anything else runs against it (for the upgrade suite, before `migrate`);
  - the linked directory.
- **Teardown** releases only those, in the current order:
  1. close the apps;
  2. end and drain the client pools;
  3. `DROP OWNED`/`DROP ROLE` for the created roles only, through the owner;
  4. end and drain the owner;
  5. drop the database;
  6. remove the directory.

  Without roles, the pools and the owner are ended and drained together, as today.
- **Failures.** Nothing is caught. The first failing step's error propagates, and later steps, including the drop, do not run. So no database is dropped while an owned client may still be connected.
- **Unchanged:** the test bodies, which keep their `let` handles; all 14 behaviors; the E62 fence; the historical fixture; and the strict migrator report.

**C15-F02 (worker).** A local, bounded actual-client-end drain, an equivalent of the reviewed API mechanism without importing that module.
- Each pool is registered before first use, and an end promise is recorded for every client it connects (public `connect` and `end` events).
- Teardown ends each pool, then waits, bounded to 15 s, for every recorded client to actually end, and only then drops the database and removes the directory.
- There are no private pg internals, no global handlers and no error suppression.
- The five behavior bodies stay byte-identical.

**Meaningful controls.**
- **Real-c15 causal fail-before (API).** An external harness runs the unchanged file with cwd set to a scratch directory whose `db/migrations` links every real migration except a broken historical one (a real SQL failure), and `TMPDIR` set to a scratch directory. It asserts no leftover database, role or temp directory, and records which errors are visible. It is expected to fail on c15 (the upgrade suite's `sophia_u_*` database and its linked directory stay) and to pass on R1.
- **New isolated in-file regressions (API):**
  - a real failure after `EmptyDatabase` creation, before migration completes: the original error is kept, and the database and directory are released;
  - partial creation (an app, pools and one of two roles created, then a failure): exactly those are released, in order, and the created role and the database are gone;
  - a held `pg.Client` end through the registry: no drop before that client actually ends;
  - a registry with nothing acquired: it releases without error;
  - a failing drop through the registry: that error stays visible and later steps do not run.
- **New isolated regression (worker).** A deterministic held `pg.Client` end through the worker's own release: `Pool.end()` resolves while the backend is still connected, the drop has not run, and the release has not resolved. Releasing the client lets the drain finish, and then the drop runs with no owned backend left.
- **Fail-before for the in-file regressions.** These functions are new, so on c15 they are a mutant: R1's file with c15's teardown semantics restored in the release function (database registered only after migration, no drain). The run must fail on the causal assertions, not on a missing import. The worker port-1 pre-handle adverse is repeated.
- **Not run and therefore not claimed:** a real pg `end()` failure.

**Checks.**
- A NEW owned PG16 on 127.0.0.1:55547 at `/var/tmp/selection-installation-repair-r1-pg55547/{data,log,sock,secret}`.
- A fail-closed pre-start census with the tools that exist (`ss` is absent): `/proc/net/tcp` (`/proc/net/tcp6` is absent here), a `/proc/*/cmdline` scan, and absence of the directory. Setup stops if any of these cannot be read.
- Node 24.21.0, pnpm 11.7.0, a frozen offline install, umask 0022.
- Both whole files, the adverses and the mutants, each with its actual inner and caller exit.
- format, lint, typecheck; build; `pnpm artifacts` verify only (8 of 8, no record).
- No broad DB rerun.

**Then HOLD before commit and ordinary.** The EARLY PRECOMMIT SOURCE packet goes to root, and nothing is committed until root's explicit commit-ready. No push, PR, comment, CI, merge, deploy, flag, provider, native or voice effect. All parent, CI, GOV, human, RTA and owner-app holds are retained.

### R1 operational plan: focused PG stop before HOLD (addendum `FOCUSED-PG-STOP-BEFORE-HOLD-001`, received during the focused runs; appended after they ended, with no runner reading this tree)

- The R1 focused PG 55547 is stopped before the source packet and HOLD, not kept for the ordinary:
  1. an authenticated read-only census, with the credential only in the child's environment (a failed census stops everything and is never read as "0 clients");
  2. the positive identity control, then the wrong-identity canaries;
  3. the guarded normal `pg_ctl` stop, with its exit propagated;
  4. the reap and the point absences; data and secret are retained.
- The ONE ordinary waits for root's commit-ready and uses a NEW own PG on 55551, after a fresh census.
- c15 and its PG 55543 stay frozen and stopped.
- The stop proof is in the external packet.

## R1 outcome (precommit; c15 → this worktree, held before commit)

- **C15-F01, API.** All six after-hook patterns (eight suite instances) release through `Acquired`, the record of what each setup actually made.
  - Apps, client pools, the owner pool, created login roles, the database and the directory are each recorded when they come into existence.
  - In the upgrade suite, the `EmptyDatabase` is recorded **before** the migration, and each login role right after its `CREATE ROLE`.
  - `release` keeps the original order: apps closed; pools ended and drained by their clients' actual end; created roles dropped through the owner; the owner ended and drained; the database dropped; the directory removed.
  - Nothing is caught, and no handle that was not made is read.
- **C15-F02, worker.** Each pool is registered before its first use, for its clients' actual `end`. `releaseFixture` ends the pools, then waits (bounded to 15 s) for each client to actually end, then drops the database, then removes the directory.
- **Unchanged:**
  - every original test body: the API diff removes only setup and teardown lines, and the worker's behavior describe is byte-identical (sha256 `1294ed95…`, 117 lines);
  - the E62 fence, the historical fixture and the strict migrator report.
- **New isolated regressions:**
  - API, 4: a real migration failure after `EmptyDatabase`; a partial setup (one role, pool and app); a held client end; nothing acquired and a failing drop.
  - Worker, 2: a held client end through the fixture's release; nothing made and a failing drop.

## R1 evidence (own PG16 16.15 on 127.0.0.1:55547; Node 24.21.0; pnpm 11.7.0; frozen offline install; umask 0022)

Each line gives the inner exit, then the caller's.

| Check | Result |
|---|---|
| **Causal fail-before on the unchanged c15 API bytes** (`804162b6`): a real failing historical 0107 | **LEAKED**: a `sophia_u_*` database and two linked temp directories are left; 0 TypeError lines printed; tests 14, pass 3, cancelled 11; inner 1, harness exit 1 on its v2 run |
| The same harness on the R1 bytes | **CLEAN**: no database, login role or temp directory left; the original failure stays visible; inner 1, harness exit 0 |
| API whole file, R1 | tests 18, suites 9, pass 18, fail 0, cancelled 0, skipped 0; inner 0 / caller 0 |
| Worker whole file, R1 | tests 7, suites 2, pass 7, fail 0, cancelled 0, skipped 0; inner 0 / caller 0. The cluster has only its default databases and no login role afterwards. |
| Pre-any-handle adverse (closed 127.0.0.1:1), API and worker | inner 1; 0 TypeError; no temp directory left |
| Mutants of R1, one c15 behavior restored each; every file restored to its exact blob | M1 database recorded after the migration: harness **LEAKED**. M2 no client drain: the held-client regression fails (drop with 1 backend). M3 created roles not dropped: the partial regression fails. M4 worker without the drain: the worker regression fails (drop with 1 owned backend). |

**Errata, kept:**
- Harness v1 lost its exit inside a piped subshell; v2 fixed it.
- A body-identity extractor was wrong; the diff is the evidence instead.
- The first R1 port-1 run exposed a temp directory created before its `try` in one new regression; that was fixed and rerun clean.
- The first PG census refused on its own invoking shell; it was rerun from the script file.

**Final-bytes delta (after the evidence above).**
- `pnpm lint` failed on the R1 bytes (inner 1) with two errors in new R1 code:
  - an unread `owner` handle in the "with 0104 and 0106" suite, whose teardown is now `got.release()`; the handle is removed, the owner pool is still registered, and no test body read it;
  - the `eventually` helper shadowed the imported `resolve`; it is renamed.
- Both edits are in the API file only; the worker file is unchanged.
- **Focused rerun on the final API bytes:** focus PG 55547 was started again from its own retained data, after a fresh fail-closed census. Then:
  - whole file: tests 18, pass 18, fail 0, cancelled 0, skipped 0, inner 0;
  - port-1 adverse: inner 1, 0 TypeError, no temp directory left;
  - broken-history harness: CLEAN.
- 55547 was then stopped again by the same guarded procedure. Both stops are recorded in the external packet.
- Final `format:check`, `lint` and `typecheck` all exit 0. `build` and `artifacts` exit 0, with 8 of 8 `match` and no record.

## R2. ACK and plan: C15-R1-F03, the new regressions' failure lifecycle (written after restoring the exact frozen R1 HDF, before restoring either R1 test body or editing)

**Inputs.** The R2 context zip is `e6a026b3…bb96` (21,036 B); all 5 SUMS lines are OK. Read in full: TASK, the frozen R1 bindings, CORE `c3dd0e40…1975` (CHANGES_REQUIRED, one finding: C15-R1-F03), its MD, and the root adoption.

**Identity.**
- New worktree `/home/user/Sophia-selection-installation-0109-fixture-001-r2`, branch `inc04-ci-selection-installation-0109-fixture-001-r2`, at sole parent c15 (`c15ec107`, tree `05a25474`), with 0 status lines.
- The frozen R1 tree `130660f3` is present. Its `ls-tree -r` equals the sealed 4,256-leaf inventory (`7e7889ce…`), and its 3 blobs (`31ea57bf`, `1c7b875e`, `2d11dc74`) equal the sealed bodies.
- The 4,253 leaves outside the three paths equal c15.
- c15, 1306, the R1 worktree, and PGs 55543 and 55547 are not touched or restarted.

**Seed.**
1. This HDF is restored byte-exact from frozen R1 (25,770 B, blob `2d11dc74`), and this section is appended to it.
2. Only then are the two R1 test bodies restored (`31ea57bf`, `1c7b875e`). That seed tree differs from 1306 in this HDF only.

**Lease: the same three paths.** No other write. No C2B ID or code, no framework, no dependency.

**The fix: one awaited lifecycle per affected `finally`, nothing more.**
- **API partial setup** (R1 lines 1104–1143). The case's cleanup is the registry's single `release()`, memoised. On the happy path it is awaited in the body. After an early failure, the `finally` starts it, if it never started, and awaits it. That closes the app, drains the pools, drops the created role through the owner, drains the owner, and only then drops the database. There is no direct force-drop.
- **API held end** (lines 1146–1188). The in-flight release is kept outside the happy block. The `finally` opens the held gate first, then awaits that same release, so the actual client end comes before the drop.
- **Worker held end** (lines 337–385). The `finally` opens the gate and awaits the case's own in-flight `releaseFixture`, so the test cannot return while that client is alive and the outer `after` is about to drop the database.
- **Each lifecycle is awaited once:** a memoised promise, so there is no double `Pool.end` and no overlapping drop.
- **Failures:** a body failure stays the reported error. If cleanup also fails, an `AggregateError` with the original as its `cause` is thrown. There is no suppression, no global handler, and no private pg internals.
- **Unchanged:** the E62 fence's `finally`, already awaited, is not touched.

**Controls.**
- **Three labelled, bounded synthetic early-failure controls,** one through each affected actual `finally`, each with a held owned client. While the client is held, they show that the case has not finished, the database is not dropped, and the owned backend is still connected. After the gate opens, the actual drain runs, the drop sees 0 owned backends, and the case rejects with its original SYNTHETIC failure.
- **The 1306 comparison:** the same controls run against 1306's own `finally` logic, transplanted per path as labelled mutants. The old R1 mutants M1–M3 are not claimed for these bytes.
- **Kept:**
  - all 18 API and 7 worker cases and their assertions;
  - the original 14 API and 5 worker bodies, exact;
  - the earlier c15 harness evidence, reused where the bytes are exact.
- **Not run and therefore not claimed:** a real pg `end()` failure.

**Checks.**
- A NEW focus PG16 on 127.0.0.1:55555 at `/var/tmp/selection-installation-repair-r2-pg55555/{data,log,sock,secret}`, after a fresh fail-closed `/proc` census.
- Node 24.21.0, pnpm 11.7.0, a frozen offline install, umask 0022.
- Both whole files and the controls, each with its actual inner exit and a separately archived caller exit.
- format, lint, typecheck; build; artifacts verify only (8 of 8, never a record).
- Before the packet and HOLD:
  1. an authenticated census through the child environment (a failure is never "0");
  2. the positive identity control first, then the wrong-identity canaries;
  3. the guarded normal `pg_ctl` stop, with its rc;
  4. the reap and the point absences; data and secret are retained.
- **Then the EARLY PRECOMMIT SOURCE packet and HOLD.** No commit, ordinary, push, PR, CI, merge or release until root's commit-ready. The ordinary then uses NEW PG 55551.

## R2 outcome and evidence (precommit; held before commit; appended after every evidence run and the focus-PG stop, HDF only)

**Fix (C15-R1-F03).**
- **The two API cases** (partial setup and held end) are now functions, `partialSetupCase` and `heldEndCase`, and their original `it` titles call them.
  - Each case has ONE memoised lifecycle: the partial case's registry `release()`, and the held case's in-flight release kept outside the body.
  - `bodyThenCleanup` runs the body, then always awaits that same lifecycle; the held cases open their gate first. If the partial setup fails before its release, the cleanup starts it. So apps, pools, created roles and the owner are released, and only then is the database dropped. There is no direct force-drop, and no `Pool.end` runs twice.
- **The worker held-end case** awaits its own in-flight `releaseFixture` after opening the gate, so it cannot return while that client is alive.
- **Failures:** a body failure stays the reported error. A cleanup failure is thrown; beside a body failure both are thrown as an `AggregateError`, with the body's failure as the cause.
- **Unchanged:** the E62 fence, the original 14 API and 5 worker bodies (the worker's describe sha `1294ed95…` is unchanged; the API lines removed against c15 are the same set as in 1306), and every 1306 assertion line and test title.

**New labelled controls.** Two API and one worker `F03 control (SYNTHETIC)` cases.
- Each drives a synthetic early failure through the actual cleanup path, with a held owned client.
- While held, they show the case has not finished, its database is not dropped (API) or no drop is recorded (worker), and its backend is connected.
- After release, the drop sees 0 owned backends and the original SYNTHETIC failure is the one reported.

**Evidence** (own PG16 16.15 on 127.0.0.1:55555; Node 24.21.0; pnpm 11.7.0; frozen offline install). Each line gives the inner exit, then the separately archived caller exit.

| Check | Result |
|---|---|
| API whole file | 20 tests, 9 suites, pass 20, fail 0, cancelled 0, skipped 0; inner 0 / caller 0 |
| Worker whole file | 8 tests, 2 suites, pass 8, fail 0, cancelled 0, skipped 0; inner 0 / caller 0 |
| **1306 comparison:** each case's own 1306 `finally` transplanted back, F03 controls only, files restored to their exact blobs | **N1** (API partial) fails: 1306's direct drop terminated live owned backends ("terminating connection due to administrator command"). **N2** (API held) fails the same way. **N3** (worker held) fails: the case returned after 17 ms while its release was still in flight ("asynchronous activity after the test ended"). Each: inner 1 / caller 1. |
| Port 1, pre-any-handle (API and worker) | inner 1 / caller 1; 0 TypeError; no temp directory left |
| c15 historical-migration harness on the R2 API bytes | CLEAN; harness caller 0 |
| format, lint, typecheck, build, artifacts | inner 0 / caller 0 each; 8 of 8 `match`, no record |
| Focus PG 55555 | Stopped by the guarded procedure before this append: authenticated census with 0 other clients; positive control, then 7 canaries refused; `pg_ctl` rc 0; reaped; data and secret retained |

**Limits.**
- A real pg `end()` failure is not run.
- The old R1 mutants M1–M3 are not claimed for these bytes.
- The container restarted at about 16:06Z, before 55555 was created; the earlier PGs 55543 and 55547 had been stopped normally before then.
