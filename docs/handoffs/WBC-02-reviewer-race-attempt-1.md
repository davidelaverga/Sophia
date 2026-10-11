# Implementation-session handoff

Goal and attempt: WBC-02 (SCM-01), the cold managed-reviewer race that root confirmed as a production blocker on
2026-10-11. Attempt 1: the scratch proposals r1 and r2, reviewed by root on #190's head, then this publication as a
narrow repair PR off main.
Human owner / executor resource: Davide (owner, approvals); root (Codex: independent review, real-host acceptance,
operations); Claude Code in a cloud container (linux-x64), coordinator of the #190 lane, wrote the repair; the #190
product writer stayed idle.
Native session: this Claude Code session (https://claude.ai/code/session_0155SjcXhv87RErnWEBWxfBM); no Sophia native
session was created.
Starting worktree/commit: main `fec45a0e96c4679a09da02be979503910a623c5c`, tree
`8c1232f751df67a5de16779047b21bb5f5ada176`, in a scratch clone. The repair was written and reviewed on #190's head
`5c10bce3060ca867402cb5ba869146a69af057c6` (tree `631824e4196c36be99159ab3fbb95c640bf8412f`); its 14 paths are
identical on main. The Paperclip pin checkout at `5edf55d7350c7f08c9dd132c7e0f1421fa0bf2fb` was used read only.
Ending commit/tree and changed files: «WBC-02: one source reviewer per company; its provisioning is claimed in the
plugin's namespace» (`91ea067c911c5c47bff19443ddaeb87bc13cfbd0`, tree `f43eef3ea52c365251772ccfc6f290dcaa68a6f4`), then
this records commit (this handoff and `docs/progress/WBC-02.md`). Its diff from main is byte-identical to the reviewed
r2 patch from 5c10bce3, and its 14 post-image blobs are r2's. The content commit changes 14 paths:
`packages/paperclip-plugin/migrations/002_reviewer_provisioning.sql` (new),
`packages/paperclip-plugin/src/{coordination,bind,host,memory-host}.ts`, its tests
(`reviewer-provisioning.db.test.ts` new, `coordination.db.test.ts`, `operator-fence.db.test.ts`, `bind.test.ts`),
`apps/worker/src/coordination-dispatch.test.ts` (new), `deploy/paperclip/{fence-previous-instance.sql,README.md}` and
`scripts/paperclip-{verify,host-probe}.mjs`.

## Outcome

Two first commissions of one company at once no longer leave two managed source reviewers.

- **Warm path.** A reviewer the host has bound is read (`agents.managed.get`) and used, with nothing written.
- **Claim.** Otherwise the plugin claims the company's provisioning in the namespace before it asks the host to
  reconcile. A second request meets the claim and answers 503 `reviewer_provisioning`; Sophia's worker reads that as
  unknown and reconciles by lookup.
- **End of a claim.**
  - It ends when the host answered the reconcile.
  - One the host never answered may still land, so its claim stays until an operator fences it. Time never ends a
    claim.
- **Unchanged.** No Paperclip byte changes, and `001` is unchanged.

Not done here: a real image build and its qualification, any hosted run, the worker's outbox and the app or voice
paths against the pinned host. These are listed under Remaining obligations.

## Evidence

**This session.** Scratch packets r1 (`reviewer-repair-r1-20261011.tar`, sha256 `877386f6…080f`) and r2
(`reviewer-repair-r2-20261011.tar`, sha256 `a84f1cd5…c00b`, patch `d9f45edd…ace1`) hold every raw log, failures
included. The environment was PostgreSQL 16.14, throwaway, on 127.0.0.1:55497, with Node 24.21.0.

- **Fail-before.** The 5c10bce3 plugin, run with the new test, the synthetic host and 002, fails 11 of 12:
  - two cold works give `reviewers: 2`;
  - a terminated bound reviewer replaced by two new works at once gives `live: 2`.
- **After.** The plugin DB suites pass 85/85, and the unit tests (bind, host-sql, the worker's reading of the 503) pass
  13/13. `tsc` for the plugin, the worker and the root config, type-aware oxlint and Prettier all pass. The new test
  passed ten sequential runs at 12/12.
- **Against the pin.**
  - **Build.** `scripts/paperclip-build.mjs` built r1 and r2. The MANIFEST lists 002.
  - **Built-plugin verifier.** It passed with 18 queries and 66 executes through the pin's `ctx.db` validators,
    including the claim's `INSERT … ON CONFLICT` and the retake `UPDATE`, and one reviewer for two cold works with 503
    while a reconcile was held. Its fail-befores fail as expected: on the 5c10bce3 build, and on that build with 002
    added, where the second cold work blocks.
  - **Host probe.** It passed 4/4 for r1 and r2. The pin's loader installed 001 and 002 raw, and the namespace tables
    include `reviewer_provisioning`.
  - **Receipt scanners.** `verify-manifest.mjs` passed. A scratch run of the receipt's packaged-files check over the
    image's own scan passed as built and failed without 002.

**This session, on this main-based candidate.**

- **Local tests.** With workspace packages resolved inside the candidate (main's `packages/contracts`, not #190's),
  the plugin DB suites pass 85/85 and the units pass 13/13. `tsc` for the plugin, the worker and the root config,
  type-aware oxlint and Prettier on the whole tree all pass.
- **Build.** The pin build succeeded, and its MANIFEST lists 002.
- **Bundle identity.** The built plugin worker, manifest and adapter equal the r2 build's once esbuild's module-path
  comments are removed.
- **Verifier.** It passed with 18 queries and 66 executes under the pin's validators. `verify-manifest.mjs` passed.
- **Host probe.** It passed 4/4. The pin's loader installed 001 and 002 raw, and the namespace tables include
  `reviewer_provisioning`. The pin checkout's state was the same before and after.
- **Environmental failure.** One DB run failed because the throwaway PostgreSQL had been killed (`ECONNREFUSED`, no
  shutdown in its log). It is kept as a failure; after a restart the run passed.

**Root, as root reported on 2026-10-11 (not re-run here).**

- **Full `pnpm check` on root's local r2 snapshot: exit 0.**
  - Format, lint, build, typecheck, contracts and artifacts all passed.
  - Units: 2296 passed, 70 skipped, 0 failed. Integration: 86 passed, 2 skipped, 0 failed; its database-dependent
    skips are disclosed.
  - Separately, the focused DB regressions passed 85/85 with no skips.
  - The pinned SDK build and its manifest passed, the units passed 13/13, and the validator count was 18 queries and
    66 executes.
- **Host-loader and heartbeat probe: 4/4.** The pin's loader installed 001 and 002 raw, giving six namespace tables, and
  the pin checkout was unchanged.
- **Paired acceptance on the real pinned host, run locally on the r1 source (tree `0ea92bea`; its production plugin
  and migration bytes equal r2's).**
  - Two cold concurrent works gave one live managed reviewer, one agent in total, and two distinct bound issues, before
    and after a restart.
  - The first work was cancelled by Stop; the second remained blocked.
  - All 47 stages exited 0 with no stderr, across 17 HTTP request records. The recovery deadlines were unchanged
    (15/180/540/600 s, fresh-send cap 2).
  - Timings: the first logical commission took 114.492 s (503, then a timeout, then a lookup that reconciled the
    existing issue); the second took 41.185 s; Stop took 35.043 s; the driver ran 456.56 s.
  - The invariant and dump/restore comparisons (three) were byte-identical. Every path, port and proxy thread root
    owned was cleaned.
  - Scope: a local synthetic signed client only. It did not cover Supavisor, the worker's actual outbox, the app,
    voice, or the Linux image.
- **Root accepted the exact r2 source** for publication, and for new CI and image qualification.

## Decisions and changes

- **The claim lives in the plugin's namespace, not in memory and not in the host.**
  - A lock in memory does not outlive a replaced worker or server while the host's reconcile goes on.
  - An advisory lock cannot serialize it from the plugin. A session lock taken on the host's pooled connection is not
    owned by the request. A transaction lock ends with the plugin's single statement.
  - A lock in the host would fork the pin and could starve its pool (nested `db.transaction`, `agentService.create`,
    instruction effects, `instructionTemplateVariables` callbacks).
  - No wait blocks: a contender is answered 503 at once.
- **Preserved:**
  - 409 `reviewer_missing`;
  - the worker's code (only a test of its 503 reading is added);
  - the rule that an operator, never time, ends what the host never answered.
- **Changed by root's review of r1 (in r2):**
  - the rollback runbook stops and drains coordination before any image from before 002;
  - a regression for a terminated bound reviewer;
  - the test's resend on 503 is labelled synthetic: it is not the worker's lookup or outbox.
- **Scope.** This WBC-02 plugin fix is its own narrow PR off main, not part of #190 (the voice lane, a draft held by
  its billing P1s).
  - #190 changes none of these 14 paths, so its usual merge of main takes the fix without a conflict.
  - The image bundles code-identical to the reviewed r2's.
  - No new authorization was used: nothing was pushed, deployed, applied or called by this session.

## Remaining obligations

- **Repaired image.** The repaired image is built and qualified only by CI after publication: the image workflow runs
  on this PR's paths. Root has no local Docker.
- **Integration.** Integration review and the merge to main are Luis's. #190 then merges main as it does, and its own
  image CI covers the combined head.
- **The sealed hosted r4 plan.** The sealed one-commission r4 plan (`6490274f`) is unchanged and unapproved. It is
  bound to the image before this repair, which has the race. Any hosted run needs a revised plan bound to the repaired
  image's digest, and Davide's approval.
- **An unanswered reconcile** that never lands needs an operator fence before that company can provision again.
- **Rollback.** An image from before 002 runs only with coordination stopped and drained.
- **Unchanged.** The two billing P1s on #190 stay open, G7 stays off, and #190 stays a draft.
- **Upstream proposal, not filed.** An atomic managed-agent reconcile proposal to Paperclip, if Davide wants it.
- **Scratch.** The throwaway PostgreSQL on port 55497 (`/tmp/sophia-pcrev-pg`) is stopped and removed when root no
  longer needs it.

## Next bounded action

Root reviews these bytes. Under the owner's standing push and review scope, root then:

1. Pushes them as they are to a new branch off main (suggested: `wbc-02/reviewer-provisioning-claim`).
2. Opens a draft PR to main.
3. Lets the push, PR and Paperclip image CI qualify the repaired image.
4. Requests a fresh Codex review.

Luis reviews the integration. Nothing is merged, deployed or run hosted without its own decision.
