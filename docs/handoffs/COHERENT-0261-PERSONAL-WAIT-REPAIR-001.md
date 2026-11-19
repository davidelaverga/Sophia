# COHERENT-0261-PERSONAL-WAIT-REPAIR-001: the B76 test waits for the settlement it asserts

Session: SAME Routing17, `session_01FGXfrGsUA6jNm3sxRoSro2`.
Worktree `/home/user/Sophia-ci-personal-wait-repair-001`, new branch `inc04-ci-personal-wait-repair-001`, from published PR519 head `0261a78fd499a8be29a148bb4c4dd40f39e8e14a` (tree `38cfc5b7d43b9d9beb507857a6a9239ecded44a5`), which stays unchanged.
Stage A only: no commit. Commit, ordinary and publication are later, separate Root grants. Separate from the timing candidate (654d) and from Host18's C2B repair.

## 1. ACK and plan (written before the test edit)

**The failure.** The second 0261 push CI negative is SQL/DB job 132796635717 (run 43709116638).

- 2,060 of 2,061 tests passed.
- The one failure is `apps/api/src/personal-live.db.test.ts:621`, "a settled answer whose reply could not be written is not paid for twice when asked again" (B76). At line 635 it expected the usage states `['settled']` and read `['reserved']`.
- This failure stays on record. Nothing is rerun, cancelled or triggered.

**Diagnosis (test synchronization).**

- `companion-live.ts` reserves before the provider is asked (`LiveCall.reserve`), committing a `reserved` usage row. It settles from the reported usage afterwards, as a separate step (`LiveCall.settle`).
- The test's wait at lines 633–634 stops as soon as **any** usage row exists. A slow run can therefore read the committed `reserved` row before the settlement, and the assertion that follows requires `settled`.
- The sibling test B77 (lines 701–704) waits for that state, boundedly.
- The final provider outcome in CI is unknown. This repairs the test's wait. It does not claim every product path is fault-free.

**Repair (test only, the B76 test in `apps/api/src/personal-live.db.test.ts`).**

- After the existing existence wait, wait boundedly for `state === 'settled'`, in the same form as B77: up to 100 × 50 ms. The existing assertion then decides.
- The B76 script gains `delayMs: 500`, an option the provider double already supports. The reservation→settlement window is then exercised on every run. This is a controlled trigger, not a promise that every scheduler reproduces the original timing.
- Every original assertion and fixture step is kept: the settled cost, the reply that cannot be written, the lapsed claim reading as failed, the restart, one provider request, one settled cost, the answer written once, nothing kept, and the trigger cleanup.
- No fixed sleep is used as synchronization, no global timeout or retry is changed, and nothing is skipped. No helper file or production capability is added.
- If a production or other path proves necessary, Root gets the exact proposal and the work stops before that edit.

**Checks, recorded outside the tree.**

- Toolchain: Node 24.21.0, pnpm 11.7.0, umask 022.
- Database: an own disposable PostgreSQL 16 on 127.0.0.1:55569, through the repository's test-database helper with its real migrations.
- A causal fail-before: the unchanged test with only the 500 ms delay fails at its existing assertion.
- The whole file once on the frozen candidate.
- A never-settled adverse (the provider stream cut before its end): it must fail boundedly at the unchanged settlement assertion.
- Prettier, type-aware oxlint and the typecheck.
- A guarded normal stop of only that cluster.

**Not in Stage A.** No SQL migration, product, GEN, SDK, Map, config, lock or dependency path. No commit, ordinary, full test:db or test:sql, push, PR action, bot, CI, merge, deploy or activation. The Personal9e UI hold and all approval holds remain.

## 2. What changed (the candidate's only source change besides this handoff)

In the B76 test of `apps/api/src/personal-live.db.test.ts`:

- The script for its one provider call gains `delayMs: 500`, with a comment saying why.
- A second bounded wait (100 × 50 ms, as in B77) runs until the usage row's state is `settled`. It sits after the existing wait for the row to exist and before the unchanged settlement assertion.

Nothing else in the file changed.

The checks run on this candidate are recorded outside the tree, with their commands, exits, the temporary variants and the restoration proofs. They are the fail-before, the full file, the never-settled adverse, the static checks and the cluster's lifecycle.
