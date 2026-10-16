# The passage tasks' check counts their writes only

> 2026-10-16 · main's browser job. Six checks of `room-passage-task.spec.ts` fail on main since #383 (a report names
> the goal or task that made it): each finds an extra «task:1» among the passage tasks' writes. Test only.

## Cause

- The fixture records a passage task's writes as `task:create` and `task:done`, and a research task's read as
  `task:<revision>` (`taskRead`, since 2026-10-03). Other specs count those reads by the `task:` prefix
  (`room-passage.spec.ts`).
- Since #383, the report shown in the room reads the task that made it, so a read is recorded during these checks.
- The spec's `writes` took every `task:` record, the read among them.
- Measured: `room-passage-task.spec.ts` passes 18/18 at `1fb19a9f` (before #383) and fails 6 at `330407e4` (#383).
- **How it reached main:** #383 merged while its browser job had never finished. Both runs were cancelled, one by the
  pull request's own run and one at the job's 60-minute limit. The merge watcher dropped cancelled runs and read the
  rest as green. The watcher now waits on a check whose latest run was cancelled.

## What changes

- `writes` counts the passage tasks' writes only, `task:create` and `task:done`. The read is #383's purpose.
- The fixture's records are unchanged.

## Checks

- `room-passage-task.spec.ts` on main with the change: all its checks pass.
