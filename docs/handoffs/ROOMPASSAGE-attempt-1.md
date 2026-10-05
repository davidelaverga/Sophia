# Implementation-session handoff

Goal and attempt: ask Sophia about a passage, and keep it in the brief (`docs/plans/room-passage.md`), attempt 1. It is PR 4 of the room's $20 plan.
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `room/passage` from `main` at `5257fbd` (#106), 2026-10-05
Ending commit/tree: content commit `449304f`. Changed files:
- in `apps/studio/src/features/artifacts/`:
  - new: `passage.ts`, its test, `PassageBar.tsx`;
  - changed: `DocumentPane.tsx`, `DocumentViewer.tsx`, `artifacts.css`;
- in `apps/studio/src/features/studio/`: `ProjectShell.tsx`, `StudioShell.tsx` (the room panel's `ask`, the chat's draft takes the passage);
- in `apps/studio/src/features/voice/`: `StageMade.tsx` (Esc), `useWorkWords.ts` and `RoomStage.tsx` (reads only in sight);
- in `apps/studio/fixtures/`: new `brief-data.ts`; changed `data.ts`, `fixture-api.ts`, `room.tsx` (the brief's notes, `notes=off`, `buildOnNotes`, `loseNextReply`);
- `apps/studio/e2e/room-passage.spec.ts`; `docs/plans/room-passage.md`.

## Outcome

Selecting text in an open report's Markdown shows a small bar above it.

**Ask Sophia** (in the room) puts the passage and its source in the chat's message, before what was already written. It opens Chat and leaves the caret at the end. Nothing is sent.

**Keep** writes the passage to the brief as the member's own note, with its source.
- **Undo:** it forgets the note only when nothing else would go with it.
- **Unanswered writes:** Keep's or Undo's offer «Try again» with the same key. No other Keep is offered while one is open.
- **When it shows:** only when the brief allows this person a note.

**Also in this PR:**
- Esc puts the made object away wherever the focus is (Codex's P2 on #102).
- The work line's record is read only while the line is in sight (Codex's P2 on #106): not under a video stage, nor in a room kept out of sight.

**Independent review:**
- **First pass:** no P1. Six P2s, all fixed:
  - Keep could race an open write;
  - the line's timer hid unconfirmed and failed writes;
  - Undo's retry previewed again instead of reusing its key;
  - a passage across blocks glued words together;
  - the bar stayed unplaced when its buttons changed;
  - Ask could make a message over the chat's 2,000 characters.
- **Second pass:** no P1 or P2. Three P3s fixed:
  - an empty bar;
  - refusals now point to the brief;
  - a positive control in the out-of-sight check.
- **P3s left:**
  - when the chat's message is already full, Ask opens Chat without the passage, and says nothing;
  - the fixture doesn't replay a withdrawal by key, so the unanswered-Undo retry has only its unit test.

## Evidence

Every run used the guards' gentle mode, beside Luis's game.

- **Tests first:** the 10 first browser checks failed before the change.
- **Units:** `passage.test.ts`, 9 of 9.
- **Browser:**
  - `room-passage.spec.ts`: 14 of 14;
  - with `room-work` and `room-made`: 38 of 38;
  - before the review: with report, report-reading, room, voice-chat and captions, 133 of 134.
- **The failure seen:** `report-reading.spec.ts:692` misses by half a pixel (543.5 vs 544). It fails the same way on `main`'s own code on this machine (local fonts), so it is not this PR; CI runs it.
- **Mutations** (`light_mutants.py`): the control survives every run.
  - First run, 12 mutants: 9 killed.
  - The 3 survivors:
    - a race in the head check, fixed;
    - a weak mutant, replaced and killed;
    - a redundant caret line, removed.
  - Accepted: the press's `preventDefault` survives in Chromium, which keeps a selection on a button press. It is kept for engines that don't.
  - Review fixes: 5 of 5 killed. They cover:
    - Keep while busy;
    - blocks glued;
    - the chat limit;
    - a read out of sight;
    - a retry with a new key.

**Gates:**
- `tsc` and `oxlint --type-aware` pass on the Studio's sources, fixtures and checks. They ran directly, because this machine's Node is 24.11 and pnpm refuses the repo's 24.21.
- Prettier is clean.

**Source-register IDs consulted:** none.

## Remaining obligations

- This PR awaits CI and Codex.
- **Follow-up:** Ask with a full message should say so.

## Next bounded action

PR 5: the report's next version arriving live, with what changed, and citations' sources on hover.
