# Implementation-session handoff: PERSONAL-PAYER-ADMISSION-FOLLOWUP-001

- Goal / attempt: PR #533 discussion_r4637445317, attempt 1; consistent C2/C3 replacement admission after concurrent payer reassignment.
- Human owner / executor: Davide / delegated Codex author; native session unknown, task `/root/personal_recorded_status_author`.
- Starting parent: `eb8ef7bef660b48f0c15002c99602879d791262f`, verified detached isolated worktree.
- Authority: coordinator reserved migration 0121 and these four source paths; no account, production or publication authority.
- Ending identity: staged tree returned separately; no commit created.

## Outcome

The new additive migration `0121_personal_replacement_admission_consistency.sql` replaces the two 0103 mutators under their existing signatures. Each actual replacement decision runs inside a narrow subtransaction. A non-admitted result raises a local sentinel, rolls back its immutable seq-1 decision, explicitly clears the local decision composite, and follows the existing held/refused payer-unavailable path. C2 keeps the new replacement held; C3 leaves its existing held control and space/control revisions unchanged. Later admission still writes exactly seq 1, with active control and pending turn. Historical keyed receipts replay unchanged after that later admission. Unexpected SQL errors propagate and roll back the whole operation.

No payer locks are added. A helper-only positive payer SHARE lock was rejected because C2 may already hold old payer X while checking new payer Y; legitimate prior operator reassignments can create a cross-owner X→Y/Y→X cycle. Existing lock order, security, role grants, financial behavior, prior checks, receipt format and epoch rules are preserved. No historical data repair is attempted; any existing inconsistent rows require a separately authorized audit and policy.

## Evidence

All logs and cluster files are outside source in the sibling local `PERSONAL-PAYER-ADMISSION-FOLLOWUP-001` directory; exact absolute paths were supplied in the handback.

- `install.log`, `toolchain.log`: frozen dependencies and exact Node 24.21.0 / pnpm 11.7.0 check pass.
- PostgreSQL 16.15 binaries were read from the coordinator-supplied tool directory. A separate trust-authenticated synthetic cluster was initialized under the task, bound only to previously vacant loopback port 56481 with no Unix socket or ambient credential dependency (`pg-init.log`, `pg-start.log`, `pg-server.log`). Only the task cluster was stopped (`pg-stop.log`).
- `red.log`: normal `node --test --test-concurrency=1 packages/persistence/src/personal-replacement-admission.db.test.ts` on exact original 0103 logic: 0 pass / 2 fail / 0 skipped / 0 cancelled. C2 returned active instead of held; C3 applied instead of refused.
- The disposable seam pauses only after the real replacement precheck passes. API-login transactions are observed waiting on the exact operator advisory barrier. The operator commits a legitimate payer-owner update before releasing it, so the actual decision sees the changed payer under READ COMMITTED. Server statement timeouts, asserted wait/drain bounds and finally cleanup protect synchronization; the exact private helper definition is restored after every race.
- `green-final.log`: 5/5 dedicated checks pass, including both races, null decision receipts, no waiting decision, later seq-1 admission, unchanged historical receipt replay, unexpected real CHECK failures for C2/C3, and preserved owner / SECURITY DEFINER / search path / API-only grants.
- `expanded-db.log`: 52 pass / 0 fail / 0 skipped / 0 cancelled on the dedicated suite plus existing personal-answer-controls, personal-answer-effects, personal-admission and personal-usage DB suites. Normal node test entry points and createTestDatabase fixtures were used with an explicit task-local disposable URL; no production database or provider was contacted.
- `final-checks.log`: touched-test Prettier, type-aware oxlint and `pnpm --filter @sophia/persistence typecheck` pass. One initial expanded lint attempt caught a shadowed test variable; it was renamed without suppression. `staged-check.log` records staged whitespace verification.
- `pg-cleanup-audit.log`: zero remaining test databases and zero test API/worker logins before cluster shutdown. `mutator-definition.diff` isolates the two narrow guard changes after normalizing CREATE OR REPLACE.
- Every earlier migration remains unchanged. In particular 0103 SHA-256: `cecf214094bb88d5e0846a8165cb5c6bb86e924be14df4652d8021e50fd6a000` (verified before and after).

## Changed paths and remaining obligations

Exactly four paths: the reserved 0121 migration; packages/persistence/src/personal-replacement-admission.db.test.ts; docs/DESTINATION_MAP.md; this handoff. Applicable sources: repository AGENTS.md / CONTRIBUTING.md and pack entry, decisions, map, goal index and architecture 12; existing 0073/0079/0080 payer behavior, 0101 decision append-only semantics, 0103 control/receipt flow and the standard disposable-PG test support.

This is local source plus disposable PostgreSQL evidence, not deployment or production qualification. Full repository gate was not run. No earlier migration, runtime flag, public contract, credential, production state, GitHub object or previous commit changed. Independent exact-tree review remains the coordinator’s next bounded action before any publication decision.
