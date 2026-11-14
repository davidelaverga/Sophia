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
