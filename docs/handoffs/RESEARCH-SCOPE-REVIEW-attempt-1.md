# Implementation-session handoff

Goal and attempt: FND-RESEARCH-SCOPE-REVIEW-04, attempt 1
Human owner / executor resource: Davide (owner); B, the sole source writer in the foundation coordination (P coordinates, R2 reviews, V releases)
Native session: Claude Code desktop session `local_cf492b49-c8d1-4ab7-b811-95eaefc2b61c`
Starting worktree/commit: `sophia-ask-context-alternative`, new branch `fix/research-scope-review-context-20261102` from `29e8e6fa` (the cited-text reader, PR #491, not yet on Main `3a616524`)
Ending commit/tree and changed files: the local commit carrying this file (`git log`). See `docs/plans/research-scope-review-context.md` § What changes.

## Outcome

- New research goals no longer carry a web obligation.
- The research prompt base v2 stops the worker from claiming anything about formats it does not deliver or tools Sophia has.
- New source reviews are given the exact request each selected source was researched under, in their statement and their runtime context, bound to the exact source's task, bounded, and fenced by the existing withdrawal closure.

Old goals, manifests, results, verdicts and the reviewer's instruction are unchanged. Not shown: any model's behaviour with the new prompt or statement.

## Evidence

- Real PostgreSQL 17.11 (owned, local, fresh).
  - The 0091 tests in `coordination.db.test.ts`: 9/9.
  - `review-request-v1.db.test.ts`: 3/3.
  - The affected suites together (coordination, v1 boundary, readiness, research, Paperclip plugin, design): 288/288.
- On 29e's code: 9 of the 12 new DB tests fail.
  - The 3 that pass are the withdrawal cases, which 0033's closure already holds.
  - The prompt test fails 2 of 4.
- Wire crossing: the 8d45-identical validator refuses a v2 context; the new one accepts v1 and v2 and refuses an unknown version.
- `pnpm artifacts:record`: the bundle archive changed `2897b8b0…` → `c76ea236…`; `pnpm artifacts` reproduces every identity.
- `pnpm check`: see the result handback.

## Decisions and changes

- 0091 replaces `admit_research_task` (one literal), `propose_source_review` (manifest v2, `requestContext`, byte cap, dependency edge), `source_review_statement` and `runtime_source_review_context` (version-gated). It adds two internal functions, `review_request_origins` and `source_review_request_text`, opened to no login.
- No new column or withdrawal function: the existing closure already covers copied questions (shown by test).
- A13: `SourceReviewRequestOrigin`, `SourceReviewRequestContext`, and an optional `requestContext` on `SourceReviewTaskContext`.
- `sophia-source-review-instruction-v2` is unused: the v2 guidance is in the frozen statement, so resumed v1 reviews keep their instruction.

## Remaining obligations

- R2's whole review before any push.
- V's rollout order: the native from this bundle before 0091 and new proposals.
- V and the owner must choose how the Ask service executor pin follows the bundle change (new executor digest).
- Owned PostgreSQL clusters are stopped, with data kept, at the end of the session.

## Next bounded action

R2 independent review of the whole candidate, then P's publication packet.
