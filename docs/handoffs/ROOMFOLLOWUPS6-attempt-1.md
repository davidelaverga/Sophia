# Implementation-session handoff

Goal and attempt: follow-ups to #126–#129 (`docs/plans/room-follow-ups-6.md`), attempt 1. It is PR 24 of the room's $20 plan, behind the vision flag.
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `room/follow-ups-6` on `room/return` (#129), 2026-10-06
Ending commit/tree: the content commit «Room: follow-ups to #126–#129», the parent of this handoff's commit.

## Outcome

Codex's six P2s on #126–#129:
- **A feed move during a read** is kept pending and read again once that read settles (`feed-step.ts`, `useFeedRefetch`).
- **A task's quote** is cut between characters as a reader sees them, with the segmenter where the browser has one and code points where it doesn't. It is measured in UTF-16 units, the strictest count the API applies, so it stays within 800.
- **Following after a reconnect** forgets what it heard only once the ask is published. A refused ask is asked again until the call ends or another drop starts its own resync. With only guests in the call, nobody is asked.
- **Back from another view,** what a call followed is followed again: it is kept by project, person and call.
- **A search's old hits** go as soon as the words change, and so do More results and the count.
- **«After the meeting»** is read again every 4 s while its work goes on and nothing came, for ten minutes at most.

**Independent review:**
- **Two P2s, both fixed:**
  - the grapheme cut could exceed the API's count and threw in Firefox before 125;
  - the ask's retry never stopped.
- **P3s fixed:**
  - no ask to guests;
  - the key includes the person;
  - More results and the count while typing;
  - polling bounded and on outcomes after the close;
  - an orphaned comment.

## Evidence

Runs used the guards' gentle mode, at Idle priority beside Luis's games, on his word.

- **Browser:** following, search, return, passage-task and review: 56 of 56.
- **Units** (feed-step, task-view, following-signal, cite-view): 50 of 50.
- **Mutations:** 5 of 5 unit mutants and 3 of 3 e2e mutants killed, and the controls survive.
  - **Unit mutants:**
    - a move forgotten;
    - a quote past the limit;
    - forgotten before the ask;
    - retries outliving the call (the suite never ends);
    - a guests-only call asked.
  - **E2e mutants:**
    - following forgotten across views;
    - old hits while typing;
    - «After» never read again.
  - The unit runner now has a timeout: a hang counts as a kill. One run hung on the retry mutant, and its file was put back from the journal.
- **Gates:** `tsc`, `oxlint --type-aware` and Prettier pass.

**Source-register IDs consulted:** none.

## Remaining obligations

This PR awaits #129, CI and Codex.

## Next bounded action

Davide's next chapters, after Luis's review of the video.
