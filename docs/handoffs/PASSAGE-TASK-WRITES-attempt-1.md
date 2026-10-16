# Implementation-session handoff

Goal and attempt: PASSAGE-TASK-WRITES (main's browser job: room-passage-task fails since #383, and the job is cut off at
60 minutes), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktrees `Sophia-e2e` and `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `test/passage-task-writes` from `origin/main` (`e1cc4b4d`)
Writable scope: `apps/studio/e2e/room-passage-task.spec.ts`, the browser job's limit in `.github/workflows/ci.yml`,
`docs/plans`, `docs/handoffs`.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-16, «Procede»; merges on green with no open P1. Main's browser job is red, which
blocks every merge.
Ending commit/tree: `2102bba05d70` (tree `0c07c107d96d`), the last commit of `test/passage-task-writes`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 6 files changed against
`origin/main` at that commit: `.github/workflows/ci.yml`, `e2e/project-activity.spec.ts`, `e2e/room-passage-task.spec.ts`, `docs/handoffs/PASSAGE-TASK-WRITES-attempt-1.md`, `docs/plans/browser-job-timeout.md`, `docs/plans/passage-task-writes.md`. The review notes below name the commit of each later change.

## Outcome

- **`room-passage-task.spec.ts`:** `writes` counts the passage tasks' writes only, `task:create` and `task:done`. The
  research task's read is #383's purpose, recorded as `task:<revision>`.
- **`project-activity.spec.ts`:** the slow read's check moves the clock until the note comes, so a slow timer that
  starts after one jump no longer misses it.
- **The browser job's limit is 90 minutes** (`ci.yml`), so a busy runner no longer cuts the suite off at 60.
  - Folded in from #408, so main's repair lands in one run.
  - Apart, each PR would have been blocked by the other.

## Evidence

- Plans: `docs/plans/passage-task-writes.md`, `docs/plans/browser-job-timeout.md`.
- **Bisected locally:** `room-passage-task.spec.ts` passes 18/18 at `1fb19a9f`, before #383, and fails 6 at
  `330407e4`, #383 itself.
- **After the change, on main:** room-passage-task, room-passage and report: 92/92. Type-aware lint is clean.
- **The activity check:** it timed out at line 65 in #399's run and in #407's re-run. Changed, it passes 25/25 over five
  repeats locally.
- **The limit's measures:**
  - #382 ran 1,707 checks in 45.0 minutes, #384 1,705 in 44.7;
  - #399's run was cut off at 60 after 1,584 checks («exceeded the maximum execution time of 1h0m0s»);
  - no retries are configured.

## Decisions and changes

- **The spec changes, not the fixture's records:** `room-passage.spec.ts` counts the research task's reads by the
  `task:` prefix.
- **90 minutes, not sharding:** sharding would rename the required check. It stays a later choice.
- **How it reached main:** #383 merged while its browser job had never finished. Both runs were cancelled, one when its
  own pull-request run superseded it, one at the 60-minute limit, and the merge watcher dropped cancelled runs. It now
  waits on a check whose latest run was cancelled. The same happened to #355, #356, #377 and #399.

## Remaining obligations

- A full local run of the browser suite on main with this fix is under way, to find whatever else came in unverified.
  Its result goes to Luis.

## Next bounded action

- Luis: merge on green with no open P1. Then every open PR runs again on the repaired main.
- Source IDs consulted: none from the source register. The work read this repository's fixture and specs, and today's
  job logs: #382, #384, and #399's run 38923699780.
