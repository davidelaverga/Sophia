# Implementation-session handoff

Goal and attempt: the report's next version arrives live, with what changed (`docs/plans/room-live-version.md`), attempt 1. It is PR 5 of the room's $20 plan.
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `room/live-version`, rebased onto `main` at `c2c1971` (#108), 2026-10-05
Ending commit/tree: the content commit before this handoff. Changed files:
- in `apps/studio/src/features/artifacts/`:
  - new: `live-version.ts`, its test, `useLiveVersion.ts`;
  - changed: `DocumentPane.tsx`, `DocumentViewer.tsx`, `MarkdownView.tsx`, `artifacts.css`;
- `apps/studio/src/features/studio/ProjectShell.tsx` (the snapshot's cursor to the viewer);
- `apps/studio/fixtures/room.tsx` (`reviseLive`, `holdSources`);
- `apps/studio/e2e/room-live-version.spec.ts`, and `e2e/report.spec.ts` (the offer's new words);
- `docs/plans/room-live-version.md`.

## Outcome

**Live:** the open report reads its versions again when the project's feed moves, so a version Sophia publishes is offered at once: «v2 is here · 2 sections changed. Show it». A section removed is counted on its own.

**Shown from the offer:**
- the sections changed since the version on screen are marked «New» or «Changed», compared by section from the two texts;
- the facts are said in words above the text;
- the heading being read keeps its place, again once the sources arrive and the text re-flows.

The marks go once another version is chosen. A heading whose name the report repeats, or one with no letter or digit, is never marked.

**Citations:** each names its source on hover and on focus: its title and its site. The tip is drawn from `data-tip`, so it adds no text and, hidden, takes no room.

**Also:** the passage bar's buttons are 44 px tall on touch screens (Codex's P2 on #108).

**Independent review:**
- **First pass:** no P1. Three P2s, all fixed:
  - the tip widened the reading area;
  - the place drifted when the sources came after the text;
  - repeated headings were mismarked.
- **Second pass:** no P1 or P2. One P3 was applied: the tip's text is kept out of the accessibility tree.

## Evidence

Every run used the guards' gentle mode, beside Luis's game.

- **Tests first:** the 5 first browser checks failed before the change.
- **Units:** `live-version.test.ts`, 8 of 8, and `passage.test.ts`, 9 of 9.
- **Browser:**
  - `room-live-version.spec.ts`: 6 of 6;
  - after the rebase, with `room-passage` and `report`: 68 of 68;
  - before the review, with report-reading, room-made, room and work: 273 of 276. The 3 failures:
    - 2 came from the old tip's text in the citation; both pass now;
    - the third is `report-reading.spec.ts:692`, half a pixel off on this machine, as on `main`.
- **Mutations** (`light_mutants.py`): the control survives.
  - 7 of 9 were killed on the first run. The 8th, marks staying, was killed once the check went back to v2.
  - Accepted: «placed once, before the sources» survives. In this fixture a bracketed citation is a number before its sources arrive, so nothing re-flows. The unit tests and the review cover it.

**Gates:**
- `tsc`, `oxlint --type-aware` and Prettier pass. They ran directly, because this machine's Node is 24.11.

**Source-register IDs consulted:** none.

## Remaining obligations

- This PR awaits CI and Codex.
- **Follow-ups:**
  - Keep isn't offered when reading the brief's permission fails (Codex's P2 on #108);
  - a tip at the pane's right edge can still stick out while hovered.

## Next bounded action

The detail items: the lobby's time format, names over the light on a phone, the present strip's cut tile, one time formatter, and the editable discussion.
