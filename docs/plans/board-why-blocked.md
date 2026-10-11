# The board says why it is blocked, and the goal's chip how much

> 2026-10-11 · Luis: «encola las tareas». Informe-pasada-3 §5 item 9: «why blocked» on the Blocked lane's head opens
> the blocker; the blocked count on the goal's chip. Follows #236 (the Blocked lane). No API change.

## What was measured

- The Blocked lane (#236) names its tiles; each tile's foot says «After Implement the PDF retry». A tile is one press
  (its sheet), so the foot cannot carry a press of its own; the way to the blocker is tile → sheet → «Waits on».
- A goal's chip in the rail says its faces, «7 tasks» and «for you»; nothing says that one of them cannot start.

## What changes

- **`blockersOf(blocked, rows)`** (`plan.ts`, pure): the items of the plan the blocked rows wait on that are not
  complete, once each, in the order they came.
- **The lane's head says why** (`LaneWhy` under the Blocked lane's head): «Waiting on» and each blocker's purpose as
  a `text-button` that opens its sheet (`onOpen`), the same opener a tile has. Only on the Blocked lane, only while
  it has rows.
- **The goal's chip** (`PlanTab`): «N blocked» after the tasks' count, in the held tone, when any task is blocked
  (`laneOf(row, rows) === 'blocked'`).

## States

- The blocker completes: the row leaves Blocked, the lane goes with it (#236), the chip's count with it.
- Several blocked rows waiting on the same blocker: it is named once.

## Checks (written first)

- `plan.test.ts`: `blockersOf` names a blocker once for two dependents, skips one complete, keeps the order.
- `e2e/board-why.spec.ts` on the Tasks fixture: the Blocked lane's head reads «Waiting on Implement the PDF retry»,
  the press opens that task's sheet; with `goals=6` the first goal's chip says «1 blocked», the fonts goal's says
  nothing of the kind.
- `pnpm check` clean; `work.spec.ts` unchanged.

## Left

- A blocker outside the plan is not named (nothing is known of it; the board already says the plan does not hold
  together).
