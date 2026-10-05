# Implementation-session handoff

Goal and attempt: show a report to everyone, as Meet shows a screen (`docs/plans/room-present.md`), attempt 1. It is PR 6 of the room's $20 plan, and the first piece built under the vision flag (Luis, 2026-10-05: everything to main, what needs an API behind a flag that only the fixture pages set).
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `room/present`, rebased onto `main` at `ad1422f` (#109), 2026-10-05
Ending commit/tree: the content commit before this handoff. Changed files:
- **The flag and the proposed API:** `src/app/vision.ts`, `src/api/vision.ts`, `src/vite-env.d.ts`, `vite.fixtures.config.ts`.
- **In `src/features/voice/`:**
  - new: `present-view.ts` and its test, `StagePresent.tsx`, `ShowEveryone.tsx`, `PresentedReport.tsx`, `focus-arrival.ts`;
  - changed: `RoomStage.tsx`, `VideoStage.tsx`, `StageMade.tsx`.
- **Elsewhere in the Studio:**
  - in `src/features/studio/`: `StudioShell.tsx`, `ProjectShell.tsx`;
  - in `src/features/artifacts/`: `DocumentPane.tsx`, `DocumentViewer.tsx`;
  - `src/app/theme.css`.
- **The fixture:**
  - `fixtures/focus-data.ts` (new);
  - `fixtures/fixture-api.ts`;
  - `fixtures/room.tsx`: `show(n | 'me' | null)` and `loseNextFocusReply`.
- **Checks and plan:** `e2e/room-present.spec.ts`, `docs/plans/room-present.md`.

## Outcome

**Following (real contract):** the snapshot's `sharedFocus` is now read.
- **The card:** someone else's show puts a card on the stage, «Marco is showing Fixture report · v1», with Follow. Following presents the report where a shared screen goes, with Sophia and the people in the strip beside it.
- **What you follow:** following is of that focus at its revision. Any change asks again, and nothing shown ends it.
- **A shared screen** keeps the stage; the report waits as the card.

**Showing (vision flag):** «Show everyone» is on the made object and in the report pane's head, for the current version only. It calls the A14 writer proposed in #105 (`PUT /api/v1/rooms/{roomId}/focus`).
- **The request:** the room's revision travels with the intent, with one key per intent. A stale room is said, and «Try again» resends the same request.
- **Stopping:** my own show always has Stop showing: on the stage, or on my card when the stage can't present it.

**Focus:**
- a report shown from here takes the focus as it arrives;
- Stop following puts it on Follow, once;
- Stop showing puts it on Chat.

**The flag:** production builds read `vite.config.ts` only, so `VISION` is false there and the button never shows (verified by the review).

**Independent review:**
- **First pass:**
  - P1, fixed: showing a version that isn't current left the shower unable to stop it.
  - P2s, fixed: the retry payload, following moving without a press, focus lost, a second key while the outcome was unknown.
- **Second pass:** 2 P2s about focus (stealing it after Stop following, and losing it on Stop showing). Both fixed, with the P3s.
- **Contract note for A14:** `sharedFocus` should carry the artifact's id. Today a version that isn't among the snapshot's current ones can be named but not followed.

## Evidence

Every run used the guards' gentle mode, beside Luis's game.

- **Tests first:** the 7 first browser checks failed before the change.
- **Units:** `present-view.test.ts`, 7 of 7.
- **Browser:**
  - `room-present.spec.ts`: 13 of 13;
  - with room, people, captions, made, passage, live-version and report: 144 of 144 before the last focus check.
- **Mutations** (`light_mutants.py`): 9, then 6, then 3 mutants, all killed; the control survives every run.
  - One survived at first: the focus taken by a report shown from here. A check now covers it (shown from the pane, after the pane gave the focus back to Chat).
- **Captures** (`safe-browser.cjs`, software rendering): the card, and the followed report on desktop and phone.

**Gates:**
- `tsc`, `oxlint --type-aware` and Prettier pass. They ran directly, because this machine's Node is 24.11.

**Source-register IDs consulted:** none.

## Remaining obligations

- This PR awaits CI and Codex.
- **Follow-ups:**
  - «2 following» (a LiveKit attribute, A14);
  - the shared anchor (`present_section`);
  - Esc as Stop following.

## Next bounded action

PR 7: Sophia's voice lights the report on the stage, from her captions, with the section index.
