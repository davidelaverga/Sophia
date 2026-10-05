# Implementation-session handoff

Goal and attempt: Sophia's line says what she is doing (`docs/plans/room-work-line.md`), attempt 1. It is PR 3b of the room's $20 plan.
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `room/work-line`, rebased onto `main` at `4ded47a` (#102), 2026-10-05
Ending commit/tree and changed files: these files changed:
- in `apps/studio/src/features/voice/`: `work-line.ts` and its test, `useWorkWords.ts`, `room-view.ts` (`roomLine`'s `doing`, `workCountText`, `WORKING_PHASES` exported) and `RoomStage.tsx`;
- in `apps/studio/fixtures/`: `report-data.ts` (`researchRunning`), `fixture-api.ts` and `room.tsx` (`research=running`, `researchProgress`, `researchDone`);
- `apps/studio/e2e/room-work.spec.ts`;
- `docs/plans/room-work-line.md`.

## Outcome

While Sophia researched, the room's line said only "Working on 1 task in the background". With one native task as the only work running, her line's note now says what it is:
- "Researching", then "Researching · n sources read", from the task's record;
- "Drafting the brief" for a brief.

The record is read as Work's card reads it: the same query key, so the two share one read, every 15 s while it runs. With more work, the count stays. There is no progress bar: a reads allowance isn't how far the report is.

**Found while building:** the fixture's `specialist` broke the contract's pattern, so the read failed silently and the note stayed at its default. With the fixture fixed, the check now proves the read.

**Independent review:**
- **P1, fixed:** the words held through every working phase, so a held or stopping task still said "Researching · 3 sources read". Now they show only while she is at it (dispatched, running). Queued, held or stopping, the count says it, as before.
- **P2s, fixed:**
  - a brief's record is no longer read for nothing;
  - `roomLine`'s `doing` is tested, including that her own note ("Your microphone is off") still wins;
  - the fixture's finish keeps the task with its result ready, as the API does.
- **P2, accepted and said in the code:** with a Work card mounted too, the shared record may be read twice in 15 s, because each observer keeps its own timer.
- **P3s, fixed:** a test name, and one set of working phases shared with Work's card.

**Dropped from the design:** "Making the PDF". The contract says `pdfRendering` is true only during a "Try PDF again" rendition, after the task finished, so it would never show while she researches.

## Evidence

Runs were in the guards' gentle mode beside Luis's game.

**Commands:**
- **Tests first:** the browser checks failed before the change (the note said "Working on 1 task…").
- **Units:** `work-line.test.ts` 7 of 7, and `room-view.test.ts` 22 of 22.
- **Browser:**
  - `room-work.spec.ts`: 2 checks, 4 of 4 over 2 runs;
  - with the room, captions, people, made, voice-chat and Work specs: 236 of 236;
  - after the review: room-work, room-made, room and Work, 192 of 192.
- **Mutations** (`light_mutants.py`): the control survives every time.
  - 5 of 5 first mutants are killed.
  - 4 on the review's fixes are killed. The brief-read mutant survived the browser checks, and a unit test of `readsCount` now kills it.

**From the repo root:** `lint` and `typecheck` pass, and Prettier is clean.

**Source-register IDs consulted:** none.

## Remaining obligations

- This PR awaits CI and Codex.
- **Follow-up:** Esc closing the made object while the focus is elsewhere (Codex's P2 on #102). It goes with the next PR's keyboard work.

## Next bounded action

PR 4: ask Sophia about a passage, and keep it in the brief.
