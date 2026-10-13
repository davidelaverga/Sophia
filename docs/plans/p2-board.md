# The board: what changed said as it happened, blockers in the plan's order, the focus kept (Codex P2s on #236, #244)

Luis, 2026-10-12: «atiende los P2 en PRs pequeñas». Fifth follow-up to the kit stack's open Codex P2s. This one: the
Tasks board's while-away summary, its Blocked lane's «Waiting on» line, and the focus on that line's toggle.

## What was measured

- #236 4249597387: a task out of Blocked is always said to have had what it waited on complete, though an accepted
  revision may only have dropped the wait (or the task it waited on).
- #236 4250196278: a `sophia.plan.seen.v3` look from the previous release has no lanes, and is still read; lane-only
  moves are never said from it, and nothing rewrites it.
- #244 4250192304: «Waiting on» names blockers in the board's order (sorted by mark), not the plan's: a running blocker
  comes before one the plan lists first.
- #244 4249581789: a live update that shortens the line to three (or removes the lane) unmounts «and N more» with the
  focus on it; nothing stands for it, so the focus falls to the page.

## What changes

- **`freedSaid`** (seen.ts): out of Blocked with what it waits on in the plan all complete, «can start: what it waited
  on is complete»; waiting on nothing in the plan any more, «can start: it no longer waits on another task».
- **The look's key** is `sophia.plan.seen.v4`: a v3 look is not read, and the next look notes each task's lane.
- **`blockersOf`** takes the plan's order (its items' ids) and names the blockers in it; the board passes its plan's.
- **The toggle's focus** (`useTileFocus`): «and N more» stands for the line; gone, the focus goes to the line's last
  blocker press, else the board's first tile.

## Checks (written first)

- `seen.test.ts`: the key is v4; a v3 look is not read; a task freed by a dropped wait is not said to have had it
  complete. `plan.test.ts`: blockers in the plan's order though the board puts a running one first. All failed before.
- `e2e/board-why.spec.ts`: two of five blockers complete with the focus on «and 2 more»: the focus goes to the last
  blocker. `work.spec.ts` and `app-auth.spec.ts` read the v4 key.

## Left

- The browser checks were not run on this host for this change (the machine guard refused Playwright: free RAM under
  5 GB with AION2 open); CI is the run on record.
