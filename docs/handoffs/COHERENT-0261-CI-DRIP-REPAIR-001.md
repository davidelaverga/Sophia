# COHERENT-0261-CI-DRIP-REPAIR-001: bounded-attempt tests measured from the attempt's own start

Session: SAME Routing17, `session_01FGXfrGsUA6jNm3sxRoSro2`.
Worktree `/home/user/Sophia-ci-drip-repair-001`, new branch `inc04-ci-drip-repair-001`, from published PR519 head `0261a78fd499a8be29a148bb4c4dd40f39e8e14a` (tree `38cfc5b7d43b9d9beb507857a6a9239ecded44a5`), which stays unchanged.
Stage A only: no commit. Commit, ordinary and publication are later, separate Root grants.

## 1. ACK and plan (written before any code edit)

**The failure.** Push run 43709116638, job 132796635549 (runtime-unit), failed one test: `room-session.test.ts:6209`, "announced (drip peer)", at assertion 6220.

- The request was seen at 1794742384272 and its socket closed at 1794742384450: 178 ms.
- The test requires at least `BOUND − 20 = 180` ms.
- The same head's pull-request lane passed runtime-unit.
- This failure stays on record. Nothing is rerun, cancelled or triggered.

**Diagnosis.** The production deadline and the test's measurement start from different moments.

- **Production.** `withinAttempt` (`apps/media-bridge/src/attempt.ts`) arms the abort timer and then, in the same synchronous turn, calls `run(signal)`. Every bounded call in `room-session.ts` goes through it: holder, quiesce acknowledgement, announcement and presence via `bounded()`, and tool calls directly. So the deadline counts from the start of the attempt, before `fetch` connects or sends anything. That is the module's documented contract, and nothing shows it to be wrong.
- **The test.** The test's `peer()` stamps `Seen.at` when the peer notices the request. For the `drip` HTTP peer that is the `request` event, after the connection was accepted and the headers parsed; for the `silent` peer it is the accept. Both come later than the timer by the dispatch latency δ.
- **The result.** The predicate `closedAt − at ≥ bound − 20` silently assumes δ ≤ 20 ms. A busy runner's cold connection exceeded that (about 22 ms) while the bridge cut the attempt correctly.
- **The same assumption elsewhere.** Every test that measures a cut from `at` relies on it:
  - item 7 `cutAtBound`: holder, quiesce acknowledgement and announcement, each against a silent and a drip peer;
  - the 3 s default-bound holder;
  - item 7 B `cutAtBound`: tool-call writes, 3 attempts each;
  - the presence reports at the default bound.

**Repair (test only, `apps/media-bridge/src/room-session.test.ts`).**

- `peer()` records when the bridge calls each media function it hands out. That call happens right after `withinAttempt` armed the attempt's timer.
- Each request the peer receives carries the start of the attempt that sent it. Requests are paired in order, and one attempt is in flight at a time in these tests.
- The cut is measured from that start with the same slack as before (at least `bound − 20`, under `bound + 1000`). The request must also have reached the peer before its socket closed.
- Unchanged: BOUND, the production bounds, the retry waits, same-request identity, no retry once cancelled or no longer requested, the timer-cleared controls and the real silent and drip peers. No retry, skip or fake is added.
- If a production change or another path proves necessary, Root gets the exact path and delta and the work stops before that edit.

**Checks, recorded outside the tree.**

- Toolchain: Node 24.21.0, pnpm 11.7.0, umask 022.
- A controlled delayed dispatch, with production unchanged: the old observer-origin predicate fails and the new one passes.
- Temporary test-only negative controls, each restored with a hash proof: an early abort, no abort and a changed retry body must each fail.
- On the final frozen file: the whole `room-session.test.ts` once, Prettier on the two paths, type-aware oxlint on the test file, and the workspace typecheck.

**Not in Stage A.** No PG, SDK, GEN, lock, configuration, Map, migration, runtime artifact or Host18 A58/0110 path. No commit, ordinary, full suite, push, PR action, bot, CI, merge, deploy or activation. All approval holds remain.

## 2. What changed (the candidate's only source change besides this handoff)

`apps/media-bridge/src/room-session.test.ts`:

- `Seen` gains `started`: when the bridge began the attempt that sent the request. `at` is still when the peer saw it.
- `peer()` wraps the bounded media calls it hands out (`presence`, `ackQuiesce`, `holder`, `announced`, `toolCall`) to record each call's start. It gives each arriving request the start of the n-th call. Requests are still sent unchanged through `httpMediaService` to the real silent, drip or answer peer.
- Two shared helpers, `cutAfter` (the cut measured from `started`, null if the socket was not closed after the request arrived) and `cutWithin` (with the unchanged `bound − 20` / `bound + 1000` slack), replace every observer-origin measurement:
  - item 7 `cutAtBound`;
  - the 3 s default-bound holder;
  - item 7 B `cutAtBound`;
  - the 20 s default tool ceiling (this fifth site was found while editing; the ACK's list missed it);
  - the presence reports.
- Nothing else changed: the production code, the bounds and every other assertion are as before.

The checks run on this candidate, their commands, exits, temporary negative controls and restoration proofs are recorded outside the tree.
