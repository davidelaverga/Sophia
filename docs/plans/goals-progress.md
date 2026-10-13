# Goals: each goal's progress, and a press to its plan in Tasks

> 2026-10-13 · Luis: «Goals con avance y enlace», after `informe-vistas-20.md` finding 3.

## What was measured

- Goals and Tasks draw the same `GoalList`: Goals without controls or plans. A goal there reads its status, title,
  outcome and criteria, and nothing of how far it has gone; it can't be pressed. To see its work a person leaves for
  Tasks and finds the goal again in the rail.

## What changes

- **Each goal with a plan says its progress** under its outcome: «1 of 7 tasks done», counted from its board's lanes
  (`progressOf`: done is Complete; closed work is out of the count).
- **«Open in Tasks» takes the person to that goal's plan**: Tasks opens with the goal chosen, through a new address,
  `#goal-<id>` (as `#task-` and `#decision-` already choose a goal). A goal without a plan has neither line nor press.
- Tasks itself is unchanged, but for following the new address.

## Checks

- `plan.test.ts`: `progressOf` counts Complete as done and leaves closed work out.
- `e2e/goals-progress.spec.ts`: on Goals the planned goal says «1 of 7 tasks done» and «Open in Tasks» opens Tasks
  on its board; a goal without a plan shows neither.
- `pnpm exec prettier --check .`, `pnpm exec oxlint --type-aware .`, `tsc --noEmit -p apps/studio`; the Goals and Tasks
  specs through the guard.
