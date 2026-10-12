# Implementation-session handoff

Goal and attempt: WBC-02 / SDD-01 joint production continuation; reviewer concurrency CI correction, attempt 1; automatic handoff correction, attempt 2; underlying request-drain correction, attempt3.
Human owner / executor resource: Davide / Codex, one writer in the worktree below.
Native session: Codex task `01a10cf9-0fab-7561-9de4-702f30a511f4`; no separate native upstream session was opened.
Starting worktree/commit: `/Users/davidelaverga/Documents/Codex/2026-10-12/sophia-reviewer-concurrency-test`, `6d5a0aae704b5f3caf3e06f8266e2930c4737670`.
Ending commit/tree and changed files: reviewed test candidate `4b6c7c1ed8d4f8ff2376035d3ea5af0fa344fcdc`, tree `75983c2c3dab4cdcbb1d4f9df474a2cc8e17721c`; changed `packages/paperclip-plugin/src/reviewer-provisioning.db.test.ts` and this handoff. Published documentation amendment `317562ab006756a9c8a58251c48b2be0e6f0873c` records that preceding implementation candidate; attempt3 also retains/drains the original request after a timeout, rather than only its sentinel wrapper. The final two-file revision and tree are sealed in the linked PR's qualification attestation and private operator checkpoint after commit creation. An in-tree record cannot contain its own final Git commit/tree hashes: those hashes include the record itself. Treat those external immutable identities as required handoff fields, not as a claim that the earlier tree contains later documentation.

## Outcome

The local PostgreSQL regression proves one replacement reviewer, both commission assignments and an ended provisioning claim under a controlled stale-read crossing. An extra warm reconcile is permitted and creates no third agent. No provisioner, SQL or image runtime source changed. No user-facing production behavior was exercised by this test-only slice.

The earlier PR #270 push CI run `38301624527`, job `114985652955`, failed the old exact reconcile count (three versus two); this failed evidence is retained. Its preceding one-live-replacement and both-assignees assertions passed; final claim assertion was not reached in that failed run.

## Evidence

Commands actually run from the worktree:

- `npx --yes pnpm@11.7.0 install --frozen-lockfile`: passed.
- `npx --yes pnpm@11.7.0 exec prettier --check packages/paperclip-plugin/src/reviewer-provisioning.db.test.ts`, exact-file `oxlint --type-aware`, package typecheck and `git diff --check`: passed on the final test bytes.
- Owned PostgreSQL17.6 bootstrap followed by `node --test --test-concurrency=1 --test-timeout=180000 packages/paperclip-plugin/src/reviewer-provisioning.db.test.ts` with the disposable loopback database: 13 passed, zero failures/cancellations. Latest full suite and isolated mutation baseline were rerun on the attempt3 test bytes on12October21:18UTC.
- Isolated exact-final-byte mutation harness: controlled crossing baseline passed; duplicate warm-agent creation and restoring the incorrect exact-call assertion each failed with an ordinary assertion and zero cancellation/import failures. Test SHA-256 `60985d3002c7e1014bd2babf92bfef90ca85d6cc7fb005b0a62567c9cc303252`.

Private local evidence, kept outside Git under `/Users/davidelaverga/.codex/operator-journal/joint-SDD01-WBC02/`: `resource-cleanup-20261012/reviewer-concurrency-local-db-receipt.json`, `resource-cleanup-20261012/reviewer-concurrency-mutation-receipt.json`, and `resume-pr270-existing-reviewer-provisioning-ci-failure-independent-review-20261012.txt`. Both owned clusters/fixture copies were removed and ports55446/55447 refused connections.

Consulted sources: repository `AGENTS.md`, `CONTRIBUTING.md`, `docs/pack/templates/SESSION_HANDOFF.md`; current reviewer provisioning implementation/test; pinned Paperclip `5edf55d7350c7f08c9dd132c7e0f1421fa0bf2fb` plugin-host warm reconcile (binding re-read), and authoritative failed GitHub run/job above. No new external API binding was introduced.

Independent whole-diff review of the test candidate completed with no remaining actionable finding. Automatic code/security review of `4b6c7c1` completed; code review finding `4252226710` requested this complete session record. The `317562a` review subsequently requested the original underlying request be retained after sentinel timeout (`4252359046`), now corrected, and an exact final revision attestation (`4252359055`), whose final attestation will be written outside the self-hashing Git tree after commit creation. Attempt3 independent review and final amended-head automatic review/CI are pending, and are not recorded as passed here.

## Decisions and changes

A contender can read a missing reviewer before the winner binds it, then reclaim the ended provisioning row after the winner settles. The pinned host re-reads and returns the existing binding without creating an agent or queuing model work. The test therefore counts the exact agent population (old terminated reviewer plus one replacement), retaining live-count, assignment and final-claim assertions. A separate test forces the late warm claim; gates release and the original observed request drains even when its answered wrapper timed out; the shared answered helper also drains every original request before reporting a sentinel timeout, with bounded asserted sentinels.

Authority is the user's 12 October direction to finish without Claude and inspect every push's automatic review. Writable scope is the test and this record. Runtime unit `sophia-runtime-wbc02-dev`, production resources, spending, migrations and provisioner source are unchanged. No wider authority was required for this reversible source correction.

## Remaining obligations

PR #272 is not yet merged; final amended-head CI/automatic review and actual checkout/merge-tree audit remain required. Existing CI runs are allowed to finish and are neither cancelled nor relabelled as final-amendment evidence. PR #270's separate memory-admission finding must be repaired/reviewed before its merge. Actual Paperclip image closure must distinguish changed test inputs from bundled runtime inputs.

No deployment, hosted database attempt, provider/model/image call, access creation or Claude message occurred. Production activation, access confirmation, rollback and native/in-app acceptance remain in the joint batch. G7 stays off; voice qualification deferred, PR #190's billing findings open. Cumulative $25/10-image allowance and unresolved old model-call uncertainty remain unchanged.

## Next bounded action

Codex obtains independent review of this amended two-file candidate, pushes it, immediately checks fresh automatic review, and audits all final CI jobs/checkout against the current base before merging PR #272. Then qualify PR #270 and the final deployment tuple. Do not rerun the consumed hosted recovery test or enable production access from this handoff.
