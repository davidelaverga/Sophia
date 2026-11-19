# Implementation-session handoff: INC04-S02a

**Slice:** the atomic contributed-API admission (migration 0105). Plan: [docs/plans/atomic-admission.md](../plans/atomic-admission.md).

| Item | Value |
|---|---|
| Author | the SAME Routing/Personal Claude Code session, session_01FGXfrGsUA6jNm3sxRoSro2 |
| Base | `950d72fa` (the coherent R5 + S01b-R1 join), imported from the root bundle into a private ref |
| Branch | `inc04-s02a-atomic-admission-001` |
| Lease | INC04-S02A-ATOMIC-ADMISSION-IMPLEMENTATION-001, 10 paths. Path 5 (`selection-snapshot.db.test.ts`) was released unchanged on root's transfer; its preview coverage moved into the new suite. Root then added `packages/persistence/src/inc01-coherent.db.test.ts` (fixture-only; receipt `d744953e`) and `packages/persistence/src/conversation-runtime.db.test.ts` (one narrow registry entry for `S02A-FUND`). |
| Toolchain | Node 24.21.0, pnpm 11.7.0, frozen offline install |

## Outcome

- A pinned contributed admission now decides atomically on the one existing ledger, under the account row and then the exact qualification row, at one instant:
  - typed identity;
  - unknown effects;
  - the lineage's immutable original ceiling;
  - current qualification;
  - money counted once (actual + promised);
  - the owner's protection.
- It freezes exactly the facts it checked.
- A rebuilt successor reacquires its remainder only at its own writable dispatch, or is withheld.
- Each new paid call rechecks the current qualification, protection and totals.
- The preview counts promised money.

## Decisions and changes

- **0105:**
  - frozen-fact columns, with an INSERT-only trigger, on `api_contribution_tasks`;
  - a private claim table (funded / unfunded);
  - private ledger helpers;
  - the replaced `contribution_admission`, `contribution_bind_task`, `contribution_rebuild_bind`, `contribution_delivery_ineligible` (now evaluation only), `contribution_model_reserve`, `selection_api_candidate`;
  - `dispatch_runtime_outbox`: 0075 byte for byte plus the `S02A-FUND` block.
- **Not changed:**
  - 0001–0104, contracts and GEN, the kernel, production TypeScript, Studio, config and Map;
  - native, owner-runner and unpinned work;
  - observation, settlement, Stop, erasure, replay.
- **Behaviour change on the existing pinned path:** it now also needs the account's own current qualification, the owner's protection declaration, no unreconciled effect on the account, and room for the remaining promise.

## Evidence

Raw logs are kept outside Git. Every DB check runs against an owned disposable PostgreSQL 16 cluster, under SCRAM on loopback and peer on the private socket, with the credential in a 0600 file outside source.

**One earlier `pnpm test:sql` ran under trust auth.** That was before root's correction, and it is recorded in the external execution addendum.

All records are synthetic.

## Remaining obligations

- **Resolved boundary:** `packages/persistence/src/inc01-coherent.db.test.ts` was reported as outside the lease, and root then authorized it as a fixture-only path. It now declares protection and records a synthetic account qualification. Its orphan case uses one root-authorized synthetic historical-state fault injection (see the plan's compatibility section). It passes 15 of 15 with every assertion unchanged.
- **Resolved boundary:** the shared-definition invariant in `packages/persistence/src/conversation-runtime.db.test.ts` failed on the dispatch-only claim write (128/129 in the focused run, raw kept). Root authorized one narrow registry entry for that file. It now passes 129 of 129.
- Independent whole-source CORE and PRE.
- Exact-head automatic review and CI.
- Integration.
- RTA-qualified release and in-app tests.
- S03, S04, S05.
- Native bounded reserves.
- All 18 AC-04 cases, and native, owner, deployed-auth and app acceptance.

## Next bounded action

Independent review of this candidate. It inherits 950d's open P1/P2 hold until a separately checked coherent join with Host's 0106 repair.

## R1: integration qualification fixtures (append only)

- **New identity:** a local fixture-only sole child of `d9f88836` on `inc04-s02a-r1-integration-fixtures-001` (lease INC04-S02A-R1-INTEGRATION-QUALIFICATION-FIXTURES-001, two paths).
- **Why:** d9's ONE ordinary failed. 2 tests in `tests/integration/contribution-runtime-host.test.mjs` were refused with `account_unqualified` because the fixture predates 0105. That failure is spent and unchanged.
- **Fixture, all synthetic:**
  - The owner declares `none_applicable` protection through the owner route.
  - The operator records an account qualification (migration owner) for the connection's current credential revision: revision 1 before the original admission, revision 2 right after rotation. That keeps the drain decided by the real old-runtime guard (`runtime_unavailable`).
  - No assertion, timeout, guard or production byte changed. The eight other S02a paths are byte-identical to d9; this handoff is d9's exact 4009-byte text with this section appended (corrected in the coherent candidate below; R1 first said "all nine").
- **Checks:** the whole affected integration file 10/10, including rotation and the S5c r2/r3 UID 65534 crossings; format, lint and typecheck exit 0.
- **Limits:**
  - The child inherits 950d's open PR519 F01/F02 until a separately checked 0105 + 0106 coherent candidate.
  - No publication; native, owner, deployed and app gates and all 18 AC-04 cases stay open.

## Coherent candidate: 0105 with 0106 (INC04-S02A-COHERENT-001-R1)

- **Identity:**
  - One normal signed merge, ordered parents `32b87da3` (published R2: 0106 and the installation guard) and `8f90112f` (this slice with the R1 fixture).
  - The unmodified union is tree `961c7ecc`: conflict-free, 287 paths against `953e5dc3`.
  - Lease: 13 paths, plus 4 existing readiness tests by root's amendment (17 at most).
  - Both parents stay as reviewed.
- **Why:** a database can hold 0106 without 0105. Every predicate of the earlier source passed there, and the maintained admission, the paid reserve and the worker's dispatch reached the old same-signature SQL.
- **Change:**
  - One catalog proof of 0105, in `packages/persistence/src/contribution-installation.ts`. It requires the claim table, the lineage-holds and dispatch-fund helpers, and the seven checked facts. It reads the catalog only and never remembers false.
  - The proof is required by:
    - `/ready`, as a core minimum whatever the switches say;
    - the contribution routes and the preview, in their own predicates;
    - `admitResearchTask` and `runtimeResearchReserve`, before their SQL;
    - the worker, for new work only.
  - Settlement, reconciliation, Stop, controls and the other runtime operations are unchanged.
- **Worker:**
  - New work (`cleanup` false, as the claim returned it) is held while 0105 is missing or the lookup fails. It is not dispatched, funded, queued or assembled, and no outcome is recorded.
  - Its committed `dispatching` lease stands until it expires. The existing reconciliation then returns it to pending a second later, only when no runtime command exists. A row with a command reconciles from that command and is never resent.
  - Cleanup is always dispatched. A held-only pass waits like an idle one.
- **Readiness, honestly:**
  - A database without 0105 is not ready on or off. The earlier source's 200 there was true for that source.
  - With 0105 and without 0106, the API is ready with contributions off and refuses with them on.
  - The optional contrasts (voice 0085/0087, owner-runner admission, conversation inputs, the native catalog) are shown with the whole core installed:
    - voice through a real dependency-valid migration order;
    - the other three by a labelled SYNTHETIC committed rename of one prerequisite, restored with the same object, ACL and body.
- **Join edits:**
  - `contribution-admission.db.test.ts` asserts `evaluation === 'full'` before `complete`/`candidates`, with all 19 cases kept, and adds one proof case.
  - R1's "all nine" wording is corrected above.
- **Checks:** recorded in the candidate's EARLY and FINAL packets (raw logs outside Git).
- **Limits:**
  - The guards cover maintained callers only. A raw SQL caller or an older binary still needs verified migration before traffic and all producer cutover.
  - While 0105 is missing, new work can stay `dispatching` or `outcome_unknown` for a lease at a time, and a goal's Stop settles only after that reconciles.
  - RTA, owner/operator, native, deployed and app gates and all 18 AC-04 cases stay open.
