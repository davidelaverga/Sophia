# Implementation-session handoff

Goal and attempt: R1 release closeout, PR #256 source recovery/integration attempt 1.  
Human owner / executor resource: Davide; this release's Codex operator is the sole integration writer. Luis (`EdX2C`) retains integration review and the applicable merge role.  
Native session: the original CON-01 coding session identity was not recovered; this source-preparation attempt invokes no native production session.  
Starting worktree/commit: isolated `sophia-release-closeout`, actual main `1e323dc934e2bec326a17809c94943efc71e6ecd`.  
Source candidate before this handoff: `05027ac6468f7e0e8498edb003c2346ef0d45d5c`, tree `90949436a9bce9c4c26f69e34514ab3f4e678011`. The subsequent handoff-only commit is identified by this file's Git history; no self-referential ending hash is asserted.

## Outcome

Recovered the original CON-01 Phase A correction from PR #256, author head `93e9313ddb8e2cb2f64d0a1e8c64c453f3147ad9`, and refreshed that PR against accepted main without rewriting its implementation. Its original two files are `db/migrations/0053_runtime_outbox_reconcile.sql` and `packages/persistence/src/runtime.db.test.ts`; this handoff is the only additional file. The original coding attempt lacked a repository handoff, so its unrecorded execution details remain unknown rather than reconstructed as fact.

The correction counts changed outbox rows, excludes irreducible unknown outcomes before limiting the batch, and lets recoverable rows advance. Current PostgreSQL tests cover idle/unchanged results, changed-row counts, and starvation. This is source evidence, not a production dispatcher or product-acceptance claim.

## Evidence

- Exact toolchain: Node `24.21.0`, pnpm `11.7.0`; `pnpm install --frozen-lockfile` and `pnpm check` passed at `05027ac646`. Local check: 2,297 unit passes / 70 skips and 95 integration passes / 2 skips; recorded runtime artifacts reproduced.
- Owned PostgreSQL `17.6`, UTF-8: `pnpm test:sql` and the focused persistence runtime suite passed; 23 runtime tests passed. An earlier operator-created SQL_ASCII cluster failed a Unicode SQL assertion; that failed result is retained in the private operator journal. Both temporary clusters were stopped.
- [Source CI run 38705695139](https://github.com/davidelaverga/Sophia/actions/runs/38705695139) checked `05027ac646`: all six jobs and their steps passed. Chromium finished with 1,601 passes and one skip. The runtime job reproduced the recorded artifacts. The superseded PR-event run `38705670075` was cancelled by existing branch concurrency, not accepted as a passing check. This documentation correction was held locally until the executing source CI finished, so its push did not cancel that qualification.
- Code and security reviews completed at `05027ac646`. Marking the PR ready produced automatic finding [4281029030](https://github.com/davidelaverga/Sophia/pull/256#discussion_r4281029030): missing implementation-attempt handoff. This file addresses that traceability gap; independent review of the resulting commit remains required.
- [Joint owner handback / Luis review request](https://github.com/davidelaverga/Sophia/pull/107#issuecomment-6187806428). Current dependency review confirms `0053` is free on main, whose migrations end at `0050`. The existing runner requires ordered unique versions, not contiguous versions. This function depends on already-merged `0012`, not CON-only `0051` or `0052`.

## Decisions and changes

Davide's 15 October instruction replaces expired source-only micro-windows within bounded release preparation. It adds no production or spending authority. The migration bytes remain SHA-256 `bf403b7eff741a5d2056b484c802cdc4cbe382f23bc00ee5826315beedc4bae7`; signature, owner, grants, fencing, command semantics and uncertain-cost accounting remain unchanged. References Q12 / CX-0116 in the original source are retained historical provenance, not claims that this operator ran a new CON campaign.

The retained CON integration owner confirmed one writer here and one later consumption of the accepted migration. CON's historical cherry-pick `17142c192bdea2d320f9b13d94304c8c52661c13` has the same migration digest; later CON integration must not create a second migration. Complete PRs #190 / #273, unrelated CON namespace collisions and optional voice qualification are excluded from R1.

## Remaining obligations

The handoff-only head's ordinary CI and automatic review, and Luis's integration review/merge role, remain pending. The tested implementation and all runtime/component files are unchanged by this handoff. No merge, deployment, hosted migration, grant activation, model/image call, seed or image publication is certified by this handoff. The existing held production pilot, native history and all cost uncertainty are retained outside Git. This source attempt has no unsettled external paid effect; no production effect was started.

## Next bounded action

Audit the existing source CI and automatic review; resolve actionable bounded findings without reauthoring the correction. Confirm the actual main/merge tree and Auto-Deploy Off, obtain Luis's applicable integration review, then integrate #256 once. Record the resulting commit/tree in the release manifest and present one exact runtime/schema/Studio rollout for fresh human approval. Do not restart CON, repeat qualification campaigns or treat this handoff as operational authority.
