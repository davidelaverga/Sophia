# Implementation-session handoff

Goal and attempt: a link to the exact passage (`docs/plans/room-passage-link.md`), attempt 1. It is PR 8 of the room's $20 plan.
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `room/passage-link` on `room/voice-trail` (#111), 2026-10-05
Ending commit/tree: content commit `62f0f1b`. Changed files:
- in `src/features/artifacts/`:
  - new: `passage-link.ts` and its test, `PassageLink.tsx`, `usePassageArrival.ts`;
  - changed: `report-link.ts` (`passage` among the viewer's parameters, kept by `reportSearch`), `PassageBar.tsx` (Link, and the locator from the selection), `DocumentPane.tsx` (the arrival, and its note), `artifacts.css`;
- `e2e/room-passage-link.spec.ts`; `e2e/room-passage.spec.ts` (the bar now ends with Link);
- `docs/plans/room-passage-link.md`.

## Outcome

«Link» copies a link to the passage of the version on screen.

**The link carries no words of the report:** only `<block>.<word>.<count>.<hash>` (FNV-1a over the passage's words). So the address, the history, a request log or a chat's preview hold nothing a reader couldn't see without access.

**What is placed:**
- a mid-word selection takes the word;
- a selection across paragraphs links its first one's part.

**Opened:**
- once the version's sources are in, the place is checked against the hash, or the words are found where the text moved;
- the passage is lit, brought into view and focused, and the parameter leaves the address;
- **Not there:** the pane says so.
- **Another version:** shows neither.
- **No clipboard:** the link is shown, focused and selected.

**Independent review:**
- **First pass:** no P1. Five P2s, all fixed by the redesign:
  - the passage's text was in the URL;
  - a stale read after a version change;
  - a selection across blocks;
  - a mid-word selection;
  - a missing clipboard.
- **Second pass:** one P2 (a citation's label before the sources arrive broke the match), fixed by deciding once the sources settle and re-finding the place on each render.

## Evidence

Every run used the guards' gentle mode, beside Luis's game.

- **Units:** `passage-link.test.ts`, 8 of 8.
- **Browser:** `room-passage-link.spec.ts` 8 of 8, and with `room-passage` 21 of 21. With report and report-reading before the redesign, 69 of 70: the miss is the local half-pixel table check that fails on `main` too.
- **Mutations** (`light_mutants.py`):
  - 7 of 7, then 7 of 7 after the redesign (one survivor killed by a new check);
  - 1 of 1 on the settle fix;
  - the control survives every run.

**Gates:**
- `tsc`, `oxlint --type-aware` and Prettier pass. They ran directly, because this machine's Node is 24.11.

**Source-register IDs consulted:** none.

## Remaining obligations

- This PR awaits #110, #111, CI and Codex.

## Next bounded action

PR 9: write to the room, not only to Sophia (the discussion composer).
