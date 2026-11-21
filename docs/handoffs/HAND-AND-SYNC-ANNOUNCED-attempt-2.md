# Handoff · a raised hand said, «Up to date» by keyboard (attempt 2)

Branch `a11y/hand-and-sync-announced`, off `origin/main` c9c226c94. Design note: `docs/plans/hand-and-sync-announced.md`
(updated). Attempt 1: `HAND-AND-SYNC-ANNOUNCED-attempt-1.md`.

## Why a second attempt

Attempt 1's e2e (run by the coordinator through pw-direct at e085ad668) failed twice:

1. `call-raise-hand.spec.ts`: the hand line was never said. The fixture's LiveKit (`fixtures/fake-livekit.ts`) stands
   in for `livekit-room.ts` and builds its own hand signal: it never passed `onRaised`.
2. `feed-recovery.spec.ts`: the tip sat inside the pill's `role="status"`, so the status's text (its live region)
   included the help.

An independent review (no P1) asked, on the same branch: P2, the line lived in `RoomDock` (Studio view only); P3s, a
global re-heard deadline, a late-join burst said as one replaced line, a doubled description in non-live states, a
weak lowering check.

## What changed in attempt 2

- **One line for the whole call:** `HandSaidLine.tsx`, mounted once in the project's shell (`UnderTheBar`,
  `ProjectShell.tsx`) and in a guest's room (`GuestRoom.tsx`, a page of its own); gone from `RoomDock`. Said on every
  view, the call in the header's dock included.
- **Gathered raises:** `hand-said.ts` (`gatherRaises`): raises within 300 ms in one sentence. Words stay in
  `room-view.ts`: `handRaisedLine(names)`.
- **Per-hand window:** `hand-signal.ts`'s forgotten hands each keep their own 5 s deadline. «Not here» notes the
  lowering-then-raise within the window that is swallowed.
- **Fake LiveKit** says raises as `livekit-room.ts` does.
- **Pill:** a focusable `role="group"` named by its word (`aria-labelledby`), the live region (`role="status"`) on the
  word alone, the tip outside it; `aria-describedby` only when the help says more than the word.
- `GuestRoom`'s bar became `GuestBar` (the function-size limit).

## Tests, red → green

- Red commit **cb88a8d85** (tests alone). Units: 55 run, 4 fail (`hand-said.ts` missing; the per-hand window; two
  `handRaisedLine` cases). E2E (pw-gentle, grep on the new/changed tests): 4 failed, 3 passed — the line not said in the
  Studio view or on Tasks; the pill's status not found; the pill's name empty.
- Green commit **26a0941fc**. Units: the three hand files 57/57; all Studio units 2472 run, 2470 pass, the 2 known
  Windows-only failures (attention, browser-imports); `packages/ui` 43/43. E2E (pw-gentle, full
  `call-raise-hand.spec.ts` + `feed-recovery.spec.ts`): **15 passed**.
- Whole-repo `pnpm -s lint` exit 0, `pnpm -s typecheck` exit 0, Prettier on touched files.

## Open

- Luis approves the words: «Marco raised their hand.», «Marco and Lucía raised their hands.», «Marco, Lucía and Ana
  raised their hands.»
- Open PR #527 also edits `hand-signal.ts` and appends to `describe('handSignal')`: a trivial test-file conflict is
  expected.
