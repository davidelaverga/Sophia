# INC04-R07-C3-FENCE-001 Stage A: nonfinancial runtime generation fence (first C3 component)

**Header.**
- **Goal and attempt:** SOPHIA-INC-2026-11 INC-04 R07 / C3, Stage A, attempt 001.
  - Task: `ff8e1f27…39f3`, 11373 B.
  - Assessment: `f8f7b7e4` (F01–F04), with Root adoption `c55576fc`.
  - Readiness: `180e3c71` (E01–E04), with its Root adoption.
- **Human owner / executor resource:** Davide / SAME Host18, Claude Code session `session_01FGXfrGdEeRRkWqHnZfiF8C`.
- **Native session:** not applicable.
- **Starting worktree/commit:** `/home/user/Sophia-r07-c2b-durable-001`, new branch `inc04-r07-c3-fence-001` at exact signed local `abebbbad0c25087697d4c27bf759f950a63855d9` (tree `e6caaa57ca12fef3811f2ba77e366fcbb11b10f7`, sole parent 0261).
- **Ending:** an UNCOMMITTED frozen candidate (only these four NEW paths staged), sealed in FINAL-A.

## 1. ACK/PLAN (recorded before any source edit)

**External ACK:** `C3-FENCE-ACK.zip` (`9d55cf2a…6f4e`). The container had rebooted after the lost UI connection. The state was reconciled at exactly abeb/e6ca, clean, with 0111 and the four paths absent everywhere, port 55577 free, and no surviving or replayed jobs.

**Scope:** the exact four NEW paths.
- `db/migrations/0111_research_runtime_generation_fence.sql`, with 0111 reserved by Root.
- `db/tests/0111_research_runtime_generation_fence.sql`.
- `packages/persistence/src/research-runtime-generation-fence.db.test.ts`.
- This HDF.

Existing SQL functions are replaced only inside 0111. No amendment, GEN, Map, SDK, config, lock or record change. Native1 (SDK, Map, record) and Routing (frozen 21b7 ordinary) do not overlap.

**Implements (nonfinancial):**
- **post-wait re-checks:** an active-state and generation check after the project and runtime-row waits in `runtime_lease`, and in the effective 0075 `runtime_hello` before its writes (F04);
- **FENCE:** one migration-owner-only operation for a draining contributed resource. It takes the project lock first, revokes the exact runtime generation, and appends an immutable fence with a monetary-open snapshot and a retained-cause snapshot. It refuses on a size bound before any effect, with no truncation (E01).
- **The 0094 retire entry:** routed through the same fence, with its count meaning kept (E02);
- **exact replay first.**

**No** new account lock or FK wait (E03). **No** CERTIFY, RECONCILE, restriction clearing, charge, release, refund, replenishment, or D1 (disabled).

**Downstream, required:** F01 (settled-cause adjudication), F02 (active allowance restriction recurrence), F03 (account-wide certification), D1, account and allowance retirement, `outcome_unknown` jobs, evidenced late facts, and full C3.

**Holds:** publication, Luis, RTA, GOV, 8c with its erratum, the 9ed cancel, Personal 9e, native owner, deployed app and full mission are unchanged. Voice stays USER-SUSPENDED; SEC-null is informational only.

## 2. Implementation record

(Appended as the work proceeds; nothing above is rewritten.)

### 2.1 What the source does (0111)

**FENCE-LEASE: `runtime_lease`, replaced.**
- The 0012 body is kept. After its project wait and runtime-row wait, it re-reads the row and refuses a revoked capability (or a changed token) with runtime_authenticate's own error (42501 'Runtime capability revoked').
- An active runtime's late settlement is unchanged: same bridge check, same errors, same return.
- Every runtime writer that takes the lease is covered: the research, design and source-review scopes, plus the observation and turn-end callers.

**FENCE-HELLO: `runtime_hello`, replaced.**
- The effective 0075 body is copied byte for byte, plus three lines after its project wait and before any write: the capability row is read again `FOR UPDATE`, and only an active row with the same token passes.
- RETIRE-HELLO and every other branch are unchanged.
- Hello never reactivated a revoked capability, and does not now.

**Registration (0094) is unchanged.** Only a rotation, or a connection's first registration, advances `credential_revision`. A non-rotating registration at the current revision reuses that revision's resource, so a draining resource never receives a new runtime.

**FENCE: `fence_contribution_runtime(project, resource, generation)`, migration owner only.** One core, `research_runtime_fence`, runs in this order:

| Step | Effect |
|---|---|
| 1 | `projects FOR UPDATE` |
| 2 | the `api_contribution_runtimes` row `FOR UPDATE` |
| 3 | **REPLAY:** a stored fence for (project, resource) is returned before any mutable check; another token for it is refused |
| 4 | the link must be `draining` |
| 5 | the token is derived from the link's immutable binding: sha256 of `sophia-runtime-generation-v1\|project\|resource\|connection\|credential_revision` |
| 6 | a stale or mismatched token is refused |
| 7 | the resource's `runtime_instances` are locked in id order |
| 8 | the account (from its connection) and grant are read without a lock |
| 9 | **both snapshots are encoded, or the call is refused before any effect (E01)** |
| 10 | the 0094 count is computed with the exact 0094 join (E02) |
| 11 | the revoke |
| 12 | one append-only fence row (with its result) and two snapshot rows are inserted |

**The cohort** is the resource's contributed reservations (the 0094 ledger join) plus every tracked call it made (0109 identities: design, source review and account-null included).

**Monetary-open snapshot:** the cohort's reserved and uncertain rows, with their original identity, amount and state.

**Cause snapshot:** the cohort's rows with a first conflict, a first overflow, any sticky witness, or a first account or allowance restriction, settled rows included. This is a checkpoint (`checkpointOnly: true`), never a certificate.

**Encoding `research-runtime-fence-v1`:**
- a JSON array of objects, strictly ascending by `reservationId` (C order), rendered by jsonb's own output;
- digest = sha256 of `research-runtime-fence-v1|<kind>\n<encoding>`;
- bound: 256 rows and 262144 bytes; past it, SQLSTATE 54000 and nothing happens.

**Literal vector.** The two-row monetary-open array in `db/tests/0111` encodes as

`[{"state": "uncertain", "reservedUsd": 0.100000, "reservationId": "00000000-0000-4000-8000-000000000001"}, {"state": "reserved", "reservedUsd": 0.250000, "reservationId": "00000000-0000-4000-8000-000000000002"}]`

| Vector | Digest (all computed independently in Python, then asserted in SQL) |
|---|---|
| the two-row vector above | `d52baa5abd31242630ba03e5f61121795f9d06332ff1060aab57abb84fe5f624` |
| empty cause | `878809635aa93d68…` |
| empty monetary-open | `6c2ea1aec94b7c8d…` |
| generation for (1111…, 2222…, 3333…, 7) | `b4adda4c889cbf2e…` |

**`retire_contribution_runtime(project, resource)`:**
- the same signature, and exactly `{resourceId, unresolvedReservations}`;
- it now goes through the same core, taking the project lock first;
- its count is the 0094 join, frozen with the fence; a repeat returns it again;
- both entries replay the same single fence.

**Lock order and E03.** The order is projects → link → runtime rows in id order, the same project-first order every runtime writer uses.
- No account, grant or reservation row is locked.
- The fence's only foreign keys point to its own already-locked link and to its own fence row, so no FK check can wait on an account.
- No GUC is read as authority.
- The new functions and tables are revoked from PUBLIC, `sophia_api` and `sophia_worker`, and the tables have RLS with no policy.

### 2.2 Fifth path (Root addendum-001): `db/tests/0094_api_contributions.sql`

- The fail-closed selector guard flagged `research_runtime_fence` because it selects `FROM sophia.runtime_instances`.
- **Premise (checked in 0111):** it is NOT a picker. It locks and revokes only the runtime rows of the ONE named draining resource, after the generation check, and returns none.
- **The edit:** it is classified in the existing `scoped` list with a precise comment, and new assertions cover its actual signature `(uuid,uuid,text,text)`, `fence_contribution_runtime(uuid,uuid,text)`, `contribution_runtime_generation(uuid,uuid)` and the two tables. These are refused for `sophia_api`, `sophia_worker` and `sophia_conversation_assembler` (wherever the role exists).
- **Not changed:** no other line. No prefix exception, no new category, no weakened FROM/JOIN detection.
- **Control C-GUARD:** a probe selector added to 0111 makes the full SQL profile fail with 'Unclassified runtime selector c3_guard_probe'. The source was then restored exactly.

### 2.3 Evidence boundaries

This is **controlled source evidence** only: real PostgreSQL 16 on an own disposable cluster, SYNTHETIC projects, accounts, runtimes and tokens, and no provider. It is NOT native, account, deployed or app acceptance.

**Two-connection barriers:**
- The fence runs in an open transaction.
- The writer reads the committed active capability (it passed authentication).
- It is then proven to wait at the projects row: it holds the tuple lock on `sophia.projects` and waits on a transaction.
- The fence commits, and the writer is refused.
- This holds for research, design and source-review settlement and for hello.

**Causal controls** (each restored to the exact candidate sha256):

| Control | Result |
|---|---|
| M-LEASE | killed: all three settlements resolved after the fence |
| M-HELLO | killed: the fenced hello resolved |
| M-PROJECT | killed for project serialization: a fence no longer waits on a project holder, and the existing in-flight writer is no longer allowed to finish first (it is refused by FENCE-LEASE instead) |

**M-PROJECT equivalence boundary:** the four barrier tests failed only at their wait-point assertion, because the waiters queued on the runtime row instead. Their refusal outcome under that mutant was not observed. By reasoning, runtime-row serialization plus FENCE-LEASE would still refuse them.

**Not covered here:**
- a goal Stop interleaving;
- `outcome_unknown` jobs;
- the account-wide cause set;
- F01, F02 and F03;
- RECONCILE and CERTIFY;
- D1.

An empty monetary-open set is never readiness.

## 3. R1: the goal-Stop/fence interleaving (C3F-01)

(Appended; §1 and §2 are history and are not rewritten.)

### 3.1 Corrections to §2.3

- §2.3 listed "a goal Stop interleaving" as not covered. That omission did NOT satisfy the Stage A requirement ("Stop/turn-end/qualification/revoke and fence interleavings"). The turn-end-before-fence then qualification-revoke-after case is sequential evidence only. R1 adds the actual control.
- FINAL-A §7 said the other lease/hello DB suites "remain for the ordinary stage". That is imprecise. The ordinary `pnpm check` runs no `.db` tests, so it cannot cover them. A separately owned, integrated full-DB stage must.

### 3.2 The maintained entry and its semantics

The maintained goal-Stop entry is the persistence `admitGoalCommand` (kind `stop`), which calls `sophia.admit_goal_command`.
- **Effective definition:** `db/migrations/0012_runtime_service.sql:279-347` (blob `f45a10f9`).
- **How it was read:** under Root's Stop-dependency addendum, after the black-box probes, and only that range.

What it does:
- It locks `projects FOR UPDATE` FIRST, then the goal.
- On Stop:
  - `authority_epoch` +1, `state_revision` +1, status `stopping`;
  - pending non-cleanup outbox rows are superseded;
  - a `commands` row and a `project_events` row are written;
  - one cleanup `native.stop` outbox row is written per unsettled binding.
- It writes no reservation, allowance, call evidence or runtime row.

So a Stop is never billing evidence, a zero, a refund, a release or a reconciliation certificate. R1 invents no Stop refusal.

### 3.3 The control: two real orders at the project wait (fence DB test, new describe C3F-01)

- **Fence first:** the fence is held in an open transaction (project, link and runtime rows locked; revocation not committed). The goal Stop is proven waiting at the projects row: it holds the granted `sophia.projects` tuple lock and waits on a transaction id. The fence commits, and the Stop is then admitted.
- **Stop first:** a plain project holder; the Stop waits at the projects row (same proof); the fence queues behind the Stop (blocked by the Stop's pid). The holder commits; the Stop is admitted first, then the fence snapshots the post-Stop state.

Both orders assert:
- the Stop's exact goal change: epoch 1→2, state_revision 2→3, status running→stopping (observed in probes 01 and 02, then pinned) and nothing else on the goal;
- the receipt stage `admitted` and exactly one `native.stop` cleanup row;
- byte-identical reservations, allowances (cumulative), truth, history and identities before and after;
- the open reservation frozen as reserved at 0.1;
- the frozen fence row and both snapshots unchanged after a replay through a NEW connection;
- one fence only;
- Stop-first also checks the 0094 count (1) through `retire`;
- fence-first also checks that the fenced generation stays refused.

The 14 earlier cases are unchanged.

**Causal control (R1):** the existing M-PROJECT (the fence's project lock removed), run on the two new tests only:
- **Fence-first:** killed. The Stop is never blocked by the open fence.
- **Stop-first:** killed. The fence never queues behind the Stop.

Both failures are ORDERING (wait-point) failures. The Stop writes no money, so no wrong final money state was observed or is expected under the mutant. Restoration of the 0111 bytes was exact. The lease/hello mutant campaign is reused from 964a by exact production hash (0111 is unchanged at `e31c9a01`).

**Boundaries:**
- Source-level, controlled real-PG evidence on SYNTHETIC fixtures.
- Not native, account, deployed or app acceptance.
- Still downstream: F01–F03, D1, RECONCILE, CERTIFY, `outcome_unknown` jobs, late-fact finalization and full C3.

**R1 fixture adjustment (test only; assertions unchanged).** The existing privilege case sets session-level GUCs on pooled api and worker clients. When the new Stop cases ran after it in the full suite, a later runtime call reused a tainted connection and was refused "A runtime call cannot carry a member identity". This was recorded as negative N-R1-FOCUS-1 on the intermediate tree `c102cfc0`. The case now discards those two clients (`release(true)`). It is not a production defect.
