# Implementation-session handoff

Goal and attempt: the meeting so far, for whoever joins late (`docs/plans/room-so-far.md`), attempt 1. It is PR 14 of the room's $20 plan, behind the vision flag (A13's `so-far`, issue #105).
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `room/so-far` on `room/follow-ups-2` (#118), 2026-10-06
Ending commit/tree: the content commit «Room: the meeting so far, for whoever joins late (A13 on the fixture, behind the vision flag)», the parent of this handoff's commit (its SHA moves as the stack is rebased onto main).

## Outcome

**The card:** joining a meeting that began more than two minutes before, the stage shows «You joined 12 minutes in.» above the dock.
- «Catch up» opens «The meeting so far» in a sheet: the same sections as the recap, each naming who.
- «Not now», or closing the sheet, puts it away, and the focus goes to the call's controls.

**The state:**
- **Where it lives:** with the room, in ProjectBody (`useCatchUp`), so it outlasts a visit to another view.
- **When the join counts:** from the moment the call went live (`room.liveSince`), read once per join.
- **The sheet:** it renders inside the project, so it never shows over Home when the project is out of sight.

**Rejoining:** a meeting the person was in on this page offers nothing when they rejoin. That holds whether they were on time or late, caught up or not.

**Also:**
- `useKnownNames` moved to its own module, to break an import cycle.
- `.stage-over-video` stacks its cards with a gap.

**Independent review, three passes:**
- **First pass:** no P1, and six P2s. Five came from the state living in StudioShell:
  - the join measured from opening the room;
  - the dismissal lost after five minutes away;
  - the key colliding across shells;
  - the sheet showing over Home;
  - the open sheet surviving a call.
- **The sixth:** «Not now» dropped the focus, and a rejoin read as joining late.
- **The fix:** all six were fixed by moving the state to the room, keyed by `liveSince`.
- **Second pass:** one P2 left. Only a dismissal marked a meeting as known; now any running meeting found is.
- **Third pass:** no P1 or P2. Its P3 is done: the known meetings are kept per account as well as per project.
- **Left as P3:**
  - the client's clock is compared with the server's `startedAt`;
  - the card isn't withdrawn when the meeting closes during the call;
  - a failed digest read still marks the meeting as known (fail-closed).

## Evidence

Every run used the guards' gentle mode, waiting for Luis's games to close first.

- **Units:** `so-far-view.test.ts`, 2 of 2.
- **Browser:**
  - `room-so-far.spec.ts`: 8 of 8;
  - with recap, present, room and updates: 57 of 57.
- **Mutations** (`light_mutants.py`):
  - 6 of 6 killed: a meeting joined on time not remembered, a known meeting offered again, Not now dropping the focus or keeping the card, the card out of the call, and any join counted as late;
  - the control survives;
  - the join measured from the read instead of the live moment survives as an equivalent: the read happens at the live moment now that the hook lives with the room. The view-switch check guards the design.

**Gates:**
- `tsc`, `oxlint --type-aware` and Prettier pass. They ran directly, because this machine's Node is 24.11.
- `pnpm exec vite` (Playwright's webServer) fails on this machine since main moved. The fixture server ran directly (`node node_modules/vite/bin/vite.js --config vite.fixtures.config.ts`), and Playwright reuses it.

**Source-register IDs consulted:** none.

## Remaining obligations

- **Davide:** A13's `so-far` route and its Digest shape (#105).
- **This PR** awaits #118, CI and Codex.

## Next bounded action

Search with citations (A13 `search`) on the fixture, behind the flag.
