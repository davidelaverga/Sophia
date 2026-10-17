# Implementation-session handoff

Goal and attempt: GOAL-OVERDUE (a goal past its date, and your own goals; item 3 of Luis's queue), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-docs`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-docs`, branch `ui/goal-overdue` from `api/goal-owner-date` (#352;
Studio only, stacked on A25)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no deploy.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis's instruction; merges on green with no open P1, after #352.
Ending commit/tree: `fa4459206431` (tree `9106a38b381b`), the last commit of `ui/goal-overdue`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 9 files changed against
`origin/api/goal-owner-date` at that commit: `e2e/goal-overdue.spec.ts`, `fixtures/room.tsx`, `src/app/theme.css`, `src/features/work/GoalTargets.tsx`, `src/features/work/GoalsOverview.tsx`, `src/features/work/goal-day.ts`, `src/features/work/goal-due.test.ts`, `src/features/work/goal-due.ts`, `docs/plans/goal-overdue.md`. The review notes below name the commit of each later change.

## Outcome

- **`goal-due.ts`** (pure): `todayOf`, `dueOf` (overdue, today, later, or nothing when completed or undated) and
  `dueWords`.
- **`goal-day.ts`:** `dayOf` moved out of `GoalTargets.tsx` so the pure module can use it; it is still re-exported
  there.
- **`targetLine`** takes the viewer, their day and whether the goal is done. It names one's own owner «You» and returns
  the text with its `due`.
- **The row** marks overdue in the warning colour (`data-due`).
- **«Mine»** (`aria-pressed`) keeps the viewer's goals. It shows while one of the open goals is theirs.
- **Fixture:** `targets=mine`.

## Evidence

- Plan: `docs/plans/goal-overdue.md`.
- Written first and failing (commit `166cbc31`): `goal-due.test.ts` (no module) and `goal-overdue.spec.ts`, with the
  clock at 2 Nov 2026. The fixture's helper parameter was later renamed for lint.
- **After the change, locally:**
  - `goal-due.test.ts`: 3/3;
  - goal-overdue, goal-owner-date, goals-overview and search-goals specs: 20/20;
  - a capture checked the overdue row, «You» and «Mine»;
  - type-aware lint over the whole repo, typecheck and Prettier are clean.

## Remaining obligations

- #352 merges first; this then goes on main.
- CI; Codex with no open P1.
