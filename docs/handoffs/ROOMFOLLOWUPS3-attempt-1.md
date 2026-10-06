# Implementation-session handoff

Goal and attempt: follow-ups to #124 and #125, the review and task writes (`docs/plans/room-follow-ups-3.md`), attempt 1. It is PR 20 of the room's $20 plan, behind the vision flag.
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `room/follow-ups-3` on `room/passage-task` (#125), 2026-10-06
Ending commit/tree: the content commit «Room: follow-ups to #124 and #125, the review and task writes», the parent of this handoff's commit.

## Outcome

Codex's P2s on #124 (nine) and #125 (six), and the independent review's.

**Reviews (`ReviewRow`, `review-view.ts`, `useFeedRefetch.ts`):**
- **What settles a press with no reply:** only a review of mine with its verdict and its words. A record that came while the press was sending counts too; another device's different words don't.
- **Settled by the feed:** the ask closes and its words go, so no second Send can follow, and the focus goes to the row's words.
- **A refusal:** it gives way only to reviews that arrive after it was shown.
- **A write on its way:** «Approving…» or «Sending…», then the slow note.
- **A first read:** «Reading reviews…» while it is on its way, then the slow note; failed, «Reviews can’t be read now.» with Try again.
- **A refresh after the feed moves:** it reads the same query again, so one that fails keeps what was read, an open ask with its words, and its presses.
- **A late reply:** it takes its place by time (`byTime`, by `Date.parse`).
- **Nothing is reviewed before the version is on screen:** read and checked (`canDownload` of the format shown).
- **Fixture:** it takes review writes for any report.

**Tasks (`TaskList`, `PassageTask`):**
- «Creating…» and «Marking done…», with the slow note.
- «Creating the task…» in the foot once the form is closed.
- «Reading tasks…» while read; failed, Try again.
- **A refresh after the feed moves:** a failed one keeps the tasks read.
- **A task made while the first read is on its way:** it is in the list at once.
- **A viewer with no tasks** is told so, not sent to a press they don't have.
- **The quote:** within the API's 800 characters (`taskQuote`).

**Independent review:** one P2, and P3s, all fixed.
- **The P2:** a key per cursor lost what was read when a refresh failed.
- **The P3s:**
  - a refusal swallowed before it showed;
  - the focus after a settle by the feed;
  - the slow notes' and failures' roles;
  - Done's slow note;
  - `byTime` by date;
  - parked replies released when a hold ends.
- **P3s left:**
  - `before` taken from placeholder data, now moot, since no placeholder is used;
  - a request identifier on review records (the note stands in; see #105).

## Evidence

Runs used the guards' gentle mode, at Idle priority beside Luis's games, on his word.

- **Browser:** `room-review.spec.ts` with `room-passage-task.spec.ts`: 36 of 36.
- **Units** (`review-view.test.ts`, `task-view.test.ts`): 12 of 12.
- **Mutations:** 16 of 16 killed, and the control survives (36 of 36). Among them:
  - another device settling a press;
  - nothing from the feed settling one;
  - the ask staying open;
  - no word while approving or creating;
  - no slow note;
  - failed reads reading on forever;
  - a late reply on top;
  - a read per cursor (reviews and tasks);
  - reviews read in silence;
  - review before the text is on screen;
  - a task made while read lost;
  - a viewer sent to Task;
  - a Create closed in silence.
  - The runner (`served_mutants.py`, scratchpad) waits until Vite serves each mutant. It keeps a journal, so a run the guard stops never leaves a file mutated: one did once, mid-mutant, and the file was put back by hand.
- **Gates:** `tsc`, `oxlint --type-aware` and Prettier pass.

**Source-register IDs consulted:** none.

## Remaining obligations

- Codex's P2s on #121–#123: the next follow-ups PR.
- This PR awaits #125, CI and Codex.

## Next bounded action

Follow-ups to #121–#123 (search, the recap's running status, the walk, following).
