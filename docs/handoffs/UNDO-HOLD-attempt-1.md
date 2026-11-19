# UNDO-HOLD · attempt 1

Branch `work/undo-hold`, off `origin/main` c9c226c94. Design note: `docs/plans/undo-hold.md`. Not pushed.

## What changed

- `apps/studio/src/features/resources/undo-hold.ts` (new, pure): the words (`UNDO_HOLD`: «Put on hold.» / «Undo»),
  `UNDO_MS` (6000), `undoableHold` (the latest Hold/Resume/Stop for exactly the execution shown is a Hold its runtime
  confirmed, and Resume is offered), `undoUntil` (window from first offer, kept while the page lives), `endUndo`.
- `apps/studio/src/features/resources/UndoHold.tsx` (new): the line under the status line, in its own always-mounted
  polite live region; it never takes the focus, and hands it to the status line if it times out while focused. Leaving
  before its time (Undo taken, the sheet closed or turned, another execution) ends it for good, one tick later so
  StrictMode's remount keeps it.
- `SessionActs.tsx`: renders `UndoHold`; Undo is `send('resume')`, the Resume press's path, so its receipts and a
  refusal («This changed before it was sent. Nothing was sent.») are said as any Resume's. Nothing while no port.
- `resources.css`: `.act-undo:empty` out of the grid (no extra gap), the line arrives as `.act-steps` does.
- Resources' rows never offer Resume, so they never show it. No API change.

## Red → green

- Red: `431a04016` (tests + note). `node --test "apps/studio/src/**/undo-hold.test.ts"` → 1 failing file (module
  `undo-hold.ts` missing). The e2e red run was refused by the guard (free RAM 6.3 GB < 8 GB).
- Green: `6d138f425` (feature) + `807b7e9eb` (fix found in self-review: within the six seconds, K back to the task
  brought the Undo back; added `endUndo` and two unit tests for it). Units: `undo-hold.test.ts` 13/13; all Studio
  units 2471/2473, the two failures the known Windows-only ones (attention.test.ts, browser-imports.test.ts).
- `pnpm -s lint` exit 0, `pnpm -s typecheck` exit 0, Prettier clean on touched files.

## Not run

- `e2e/undo-hold.spec.ts` (5 cases) and `e2e/task-keys.spec.ts`: the guard (`pw-gentle.ps1`) refused three times (free
  RAM 6.3, 5.7, 4.3 GB). Run them before a PR:
  `pw-gentle.ps1 -Repo …\Sophia-paper-2 -Ref <head> -Detach -Specs "e2e/undo-hold.spec.ts e2e/task-keys.spec.ts"`.
  The «leaves on its own» case waits about six seconds of real time.
- Not seen on screen (no captures), light or dark.

## Open

- Copy for Luis: «Put on hold.» / «Undo». «Put on hold.» sits under the step row's «Held. Its runtime confirmed the
  hold.», which says much the same; a shorter or no lead could be chosen.
- An Undo for a Hold still on its way is out: Resume can't be sent before the view says held, so with a slow runtime the
  Undo only appears once the hold is confirmed.

## Attempt 2 · review on attempt 1 (no P1)

- **P2-1** (an Undo that came back stayed with no timer): `open` is cleared whenever there is no Hold to offer, and a
  return within the window keeps its first end, so it times out; after the window it never comes back.
- **P2-2** (window from first sight, not from settle): only a Hold this sheet saw on its way is offered
  (`pendingHold` + `undoWatch` in `undo-hold.ts`); `UndoHold` is keyed by the execution shown, so a Hold confirmed
  while the sheet was closed, turned to another task or sent from Resources offers none later. The page-long
  `undoUntil` / `endUndo` map and the deferred-end machinery are gone.
- **P2-3**: e2e for the timeout firing while Undo has the focus (focus to the status line).
- **P3**: Undo carries Resume's tip (`has-tip`, `aria-label` «Undo: <tip>»); the focus is handed to the status line
  whenever the Undo leaves while focused (layout effect), not only on timeout; windows live in the sheet's own
  `undoWatch`, swept when over.
- Copy unchanged (`UNDO_HOLD`), pending Luis.

Red → green: tests `31512ec56`. Guard run at that commit: 3 failed, 7 passed. The failures were the flicker case (P2-1), the
closed-sheet case (P2-2) and the tip. Units red too, since `pendingHold` and `undoWatch` didn't exist yet. The J-away
variant of P2-2 and the P2-3 focus case already passed there; they stay as guards. Fix `45f528021`: guard run
`undo-hold.spec.ts` + `task-keys.spec.ts` 12/12 passed; `undo-hold.test.ts` 15/15; all Studio units 2475/2477 (the two
known Windows-only failures); `pnpm -s lint` and `pnpm -s typecheck` exit 0; Prettier clean.
